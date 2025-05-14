import FastagSurveyData from "./models/fastagSurveyData.js";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { createInterface } from "readline";
import ffmpeg from "fluent-ffmpeg";
import ProgressBar from "progress";

dotenv.config();

// Configure AWS S3 with exact variable names from .env sample
const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.S3ACCESS_KEY,
    secretAccessKey: process.env.S3SECRET_KEY,
  },
});

function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
}

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

async function checkS3FileExists(s3Key) {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.S3BUCKET_NAME,
        Key: s3Key,
      })
    );
    return true;
  } catch (error) {
    if (error.name === "NotFound") {
      return false;
    }
    throw error;
  }
}

async function downloadFromS3(s3Key, downloadPath) {
  const params = {
    Bucket: process.env.S3BUCKET_NAME,
    Key: s3Key,
  };

  try {
    const data = await s3Client.send(new GetObjectCommand(params));
    const writeStream = fs.createWriteStream(downloadPath);

    return new Promise((resolve, reject) => {
      data.Body.pipe(writeStream)
        .on("error", reject)
        .on("finish", () => resolve(downloadPath));
    });
  } catch (error) {
    console.error(`Error downloading file ${s3Key}:`, error);
    throw error;
  }
}

async function uploadToS3(filePath, newS3Key) {
  const fileContent = fs.readFileSync(filePath);

  const params = {
    Bucket: process.env.S3BUCKET_NAME,
    Key: newS3Key,
    Body: fileContent,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));
    console.log(`Successfully uploaded ${newS3Key}`);
    return newS3Key;
  } catch (error) {
    console.error(`Error uploading file ${newS3Key}:`, error);
    throw error;
  }
}

function generateNewS3Key(originalKey) {
  const ext = path.extname(originalKey);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `uploads/${timestamp}_${randomString}${ext}`;
}

async function askQuestion(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function copyData(surveyorId) {
  await connectDB();

  // Step 1: Fetch surveys assigned to the surveyor
  const assignedSurveys = await FastagSurveyAssigned.find({
    surveyorId,
    status: "Completed",
  });
  console.log(
    `Found ${assignedSurveys.length} surveys assigned to surveyor ${surveyorId}`
  );

  if (assignedSurveys.length === 0) {
    console.log("No surveys found for this surveyor");
    return;
  }

  // Step 2: Get all survey data using surveyId from assigned surveys
  const allSurveyData = await FastagSurveyData.find({
    surveyId: { $in: assignedSurveys.map((s) => s._id) },
  });

  // Step 3: Check which surveys have videoProof that actually exists in S3
  const surveysWithValidVideos = [];
  const surveysWithoutValidVideos = [];
  const updatedSurveys = [];

  // Create progress bar for checking S3 files
  const checkProgress = new ProgressBar(
    "Checking S3 files [:bar] :current/:total :percent :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 40,
      total: allSurveyData.length,
    }
  );

  for (const survey of allSurveyData) {
    if (survey.videoProof) {
      const existsInS3 = await checkS3FileExists(survey.videoProof);
      if (existsInS3) {
        surveysWithValidVideos.push(survey);
      } else {
        surveysWithoutValidVideos.push(survey);
      }
    } else {
      surveysWithoutValidVideos.push(survey);
    }
    checkProgress.tick();
  }

  console.log(
    `\nFound ${surveysWithValidVideos.length} surveys with valid videos in S3`
  );
  console.log(
    `Found ${surveysWithoutValidVideos.length} surveys without valid videos`
  );

  if (surveysWithValidVideos.length === 0) {
    console.log("No surveys with valid videos found to copy from");
    return;
  }

  if (surveysWithoutValidVideos.length === 0) {
    console.log("No surveys need videos");
    return;
  }

  // Step 4: Download videos (up to 100)
  const downloadDir = "./downloaded_videos";
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir);
  }

  const videosToUse = [];
  const maxDownloads = Math.min(100, surveysWithValidVideos.length);

  // Create progress bar for downloads
  const downloadBar = new ProgressBar(
    "Downloading [:bar] :current/:total :percent :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 40,
      total: maxDownloads,
    }
  );

  for (let i = 0; i < maxDownloads; i++) {
    const survey = surveysWithValidVideos[i];
    try {
      const fileName = `${survey.videoProof}`;
      const downloadPath = path.join(downloadDir, fileName);

      await downloadFromS3(survey.videoProof, downloadPath);

      videosToUse.push({
        localPath: downloadPath,
        originalSurveyId: survey._id,
        originalS3Key: survey.videoProof,
        originalDuration: await getVideoDuration(downloadPath),
        originalVehicleCategory: survey.vehicleCategory,
        originalFuelType: survey.fuelType,
        originalPaymentType: survey.paymentType,
        originalServingTime: survey.servingTime,
      });
    } catch (error) {
      console.error(
        `\nFailed to download video for survey ${survey._id}:`,
        error.message
      );
    } finally {
      downloadBar.tick();
    }
  }

  console.log(`\nDownloaded ${videosToUse.length} videos`);

  // Step 5: Ask if user wants to upload videos
  const shouldUpload = await askQuestion(
    `Do you want to upload ${videosToUse.length} videos to surveys without valid videos? (y/n) `
  );

  if (!shouldUpload) {
    console.log("Upload cancelled");
    return;
  }

  // Step 6: Upload videos to surveys without valid videos
  const maxUploads = Math.min(
    videosToUse.length,
    surveysWithoutValidVideos.length
  );

  // Create progress bar for uploads
  const uploadBar = new ProgressBar(
    "Uploading [:bar] :current/:total :percent :etas",
    {
      complete: "=",
      incomplete: " ",
      width: 40,
      total: maxUploads,
    }
  );

  for (let i = 0; i < maxUploads; i++) {
    const video = videosToUse[i];
    const targetSurvey = surveysWithoutValidVideos[i];

    try {
      // Generate new S3 key
      const newS3Key = generateNewS3Key(video.originalS3Key);

      const uploadedKey = await uploadToS3(video.localPath, newS3Key);

      // Update the target survey with the new video
      const videoDuration = await getVideoDuration(video.localPath);
      targetSurvey.endTime = new Date(
        targetSurvey.startTime.getTime() + videoDuration * 1000
      );
      targetSurvey.vehicleCategory = video.originalVehicleCategory;
      targetSurvey.fuelType = video.originalFuelType;
      targetSurvey.paymentType = video.originalPaymentType;

      targetSurvey.videoProof = uploadedKey;
      await targetSurvey.save();
      updatedSurveys.push(targetSurvey._id.toString());
    } catch (error) {
      console.error(
        `\nFailed to process video for survey ${targetSurvey._id}:`,
        error.message
      );
    } finally {
      uploadBar.tick();
    }
  }

  console.log(`\nCompleted ${maxUploads} video transfers`);
  console.log(`Updated ${updatedSurveys.length} surveys with new video links`);
  console.log("Updated Surveys:", updatedSurveys);
  console.log("Process completed");
  process.exit(0);
}

copyData("6800b7bfce77d77fc33b28e0").catch((error) => {
  console.error("Error in copyData:", error);
  process.exit(1);
});
