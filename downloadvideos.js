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

dotenv.config();

const s3Client = new S3Client({
  region: "ap-south-1",

  credentials: {
    accessKeyId: process.env.S3ACCESS_KEY,
    secretAccessKey: process.env.S3SECRET_KEY,
  },
});
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

downloadFromS3("uploads/1747224813782_vlxalx.507Z","video.mp4")