import mongoose from "mongoose";
import AWS from "aws-sdk";
import ExcelJS from "exceljs";
import dotenv from "dotenv";
import readline from "readline/promises";
import fs from "fs";
import path from "path";
import cliProgress from "cli-progress";
import FastagSurveyData from "./models/fastagSurveyData.js";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js";

// Load env variables
dotenv.config();

// Connect to MongoDB
await mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Setup AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.S3ACCESS_KEY,
  secretAccessKey: process.env.S3SECRET_KEY,
  region: "ap-south-1",
});

const BUCKET_NAME = process.env.S3BUCKET_NAME;

// S3 video check
const doesVideoExistOnS3 = async (key) => {
  try {
    await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();
    return true;
  } catch (err) {
    if (err.code === "NotFound") return false;
    throw err;
  }
};

// Upload to S3
const uploadToS3 = async (filePath, key, surveyorId) => {
  const fileContent = fs.readFileSync(filePath);
  await s3
    .upload({
      Bucket: BUCKET_NAME,
      Key: `${surveyorId}-${key}`,
      Body: fileContent,
    })
    .promise();
};

const run = async () => {
  const missingVideos = [];
  const surveyDataList = await FastagSurveyData.find().lean();

  console.log(`📦 Fetched ${surveyDataList.length} survey records`);

  // Initialize progress bar
  const checkBar = new cliProgress.SingleBar(
    {
      format:
        "🔍 Checking videos [{bar}] {percentage}% | {value}/{total} processed",
    },
    cliProgress.Presets.shades_classic
  );
  checkBar.start(surveyDataList.length, 0);

  for (const data of surveyDataList) {
    const videoKey = data.videoProof;
    const videoExists = await doesVideoExistOnS3(videoKey);
    checkBar.increment();

    if (!videoExists) {
      const survey = await FastagSurveyAssigned.findById(data.surveyId).lean();
      if (!survey) continue;

      const user = await User.findById(survey.surveyorId)
        .select("name mobNum email employeeCode designation companyName _id")
        .lean();
      if (!user) continue;

      missingVideos.push({
        _id: data._id,
        SurveyID: data.surveyId.toString(),
        SurveyorName: user.name,
        MobileNumber: user.mobNum,
        SurveyorID: user._id.toString(),
        Email: user.email,
        EmployeeCode: user.employeeCode || "",
        Designation: user.designation || "",
        CompanyName: user.companyName || "",
        
        PlazaName: data["Plaza Name"] || "",
        PlazaCode: data["Plaza Code"] || "",
        StartTime: data.startTime,
        EndTime: data.endTime,
        VehicleCategory: data.vehicleCategory,
        FuelType: data.fuelType,
        VideoProofKey: videoKey,
        Status: "Missing on S3",
      });
    }
  }

  checkBar.stop();

  if (missingVideos.length === 0) {
    console.log("✅ All videos exist on S3. No missing data.");
    mongoose.disconnect();
    return;
  }

  const fileName = "Missing_Videos_Report.xlsx";

  const generateExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Missing Videos");

    worksheet.columns = Object.keys(missingVideos[0]).map((key) => ({
      header: key,
      key,
      width: 25,
    }));

    worksheet.addRows(missingVideos);
    await workbook.xlsx.writeFile(fileName);
    console.log(`📄 Excel generated: ${fileName}`);
  };

  await generateExcel();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await rl.question(
    "❓ Do you want to upload missing videos from 'videos/' folder to S3 now? (yes/no): "
  );

  if (answer.trim().toLowerCase() === "yes") {
    const videoDir = path.resolve("videos");

    const uploadBar = new cliProgress.SingleBar(
      { format: "📤 Uploading [{bar}] {percentage}% | {value}/{total} done" },
      cliProgress.Presets.shades_classic
    );
    uploadBar.start(missingVideos.length, 0);

    for (const item of missingVideos) {
      const localFile = fs
        .readdirSync(videoDir)
        .find(
          (f) => f === item.VideoProofKey || f.startsWith(item.VideoProofKey)
        );
      console.log("localFile", localFile);
      if (localFile) {
        const localPath = path.join(videoDir, localFile);
        const s3Exists = await doesVideoExistOnS3(localFile);

        if (!s3Exists) {
          try {
            await uploadToS3(localPath, localFile, item.SurveyorID);
            item.Status = "Uploaded";

            await FastagSurveyData.updateOne(
              { _id: item._id },
              { $set: { videoProof: `${item.SurveyorID}-${localFile}` } }
            );
            item.VideoProofKey = `${item.SurveyorID}-${localFile}`;
            console.log(`✅ Uploaded: ${item.SurveyorID}-${localFile}`);
          } catch (err) {
            item.Status = "Upload Failed";
            console.error(`❌ Failed: ${localFile} –`, err.message);
          }
        } else {
          item.Status = "Already Exists";
        }
      } else {
        item.Status = "Missing Locally";
      }

      uploadBar.increment();
    }

    uploadBar.stop();

    // Update Excel with final status
    await generateExcel();
    console.log(`✅ Final report updated: ${fileName}`);
  }

  rl.close();
  mongoose.disconnect();
};

run().catch((err) => {
  console.error("❌ Error:", err);
  mongoose.disconnect();
});
