import mongoose from "mongoose";
import ExcelJS from "exceljs";
import AWS from "aws-sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cliProgress from "cli-progress";

import FastagSurveyData from "./models/fastagSurveyData.js";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js";

dotenv.config();

// MongoDB connection
await mongoose.connect(process.env.MONGO_URI);
console.log("✅ Connected to MongoDB");

// Constants
const OUTPUT_DIR = "./output";
const VIDEO_DIR = path.join(OUTPUT_DIR, "videos");
const EXCEL_PATH = path.join(OUTPUT_DIR, "SurveyData.xlsx");

// AWS S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.S3ACCESS_KEY,
  secretAccessKey: process.env.S3SECRET_KEY,
});

// Ensure output directories
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

// Load or initialize Excel workbook
const workbook = new ExcelJS.Workbook();
let sheet;

let existingIds = new Set();
let lastCreatedAt = null;

if (fs.existsSync(EXCEL_PATH)) {
  console.log("📥 Loading existing Excel...");
  await workbook.xlsx.readFile(EXCEL_PATH);
  sheet = workbook.getWorksheet("Survey Data");

  // Map header keys to column indexes
  const headerRow = sheet.getRow(1);
  const columnIndexMap = {};
  headerRow.eachCell((cell, colNumber) => {
    columnIndexMap[cell.value] = colNumber;
  });

  // Read existing _id and createdAt values
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const rowId = row.getCell(columnIndexMap["_id"]).value;
    const createdAt = new Date(row.getCell(columnIndexMap["createdAt"]).value);
    if (rowId) existingIds.add(rowId.toString());
    if (!lastCreatedAt || createdAt > lastCreatedAt) {
      lastCreatedAt = createdAt;
    }
  });

  console.log(`🔍 Found ${existingIds.size} existing entries`);
} else {
  sheet = workbook.addWorksheet("Survey Data");
  sheet.columns = [
    { header: "_id", key: "_id", width: 24 },
    { header: "surveyId", key: "surveyId", width: 24 },
    { header: "Surveyor Name", key: "surveyorName", width: 30 },
    { header: "Surveyor Mobile", key: "surveyorMobile", width: 20 },
    { header: "Plaza Name", key: "plazaName", width: 30 },
    { header: "Plaza Code", key: "plazaCode", width: 20 },
    { header: "State", key: "state", width: 20 },
    { header: "Start Time", key: "startTime", width: 30 },
    { header: "End Time", key: "endTime", width: 30 },
    { header: "Vehicle Category", key: "vehicleCategory", width: 30 },
    { header: "Fuel Type", key: "fuelType", width: 15 },
    { header: "Latitude", key: "lat", width: 15 },
    { header: "Longitude", key: "long", width: 15 },
    { header: "Serving Time (s)", key: "servingTime", width: 20 },
    { header: "Payment Type", key: "paymentType", width: 15 },
    { header: "Video File", key: "videoProof", width: 40 },
    { header: "createdAt", key: "createdAt", width: 30 },
  ];
}

// MongoDB query
const query = {};
if (lastCreatedAt) {
  query.createdAt = { $gt: lastCreatedAt };
}

console.log("📦 Fetching new survey data...");
const surveys = await FastagSurveyData.find(query).lean();
console.log(`📊 Total new surveys: ${surveys.length}`);

// Progress bar
const progressBar = new cliProgress.SingleBar({
  format: "⬇️  Downloading Videos |{bar}| {percentage}% || {value}/{total} Files",
  barCompleteChar: "█",
  barIncompleteChar: "-",
  hideCursor: true,
});
progressBar.start(surveys.length, 0);

// Map plaza names to states
const plazaToStateMap = {
  Sosokhurd: "Jharkhand",
  Bankapur: "Karnataka",
  Vanagiri: "Karnataka",
  "Km. 288.00 Near Hitnal Vill.": "Karnataka",
  Manavasi: "Tamil Nadu",
  Poonambalapatti: "Tamil Nadu",
  Kozhinjiipatti: "Tamil Nadu",
  "Rasampalayam Plaza": "Tamil Nadu",
  Velanchettiyur: "Tamil Nadu",
  Parsoni: "Bihar",
  Pokhraira: "Bihar",
  "Dalsagar Toll Plaza": "Bihar",
  TandBalidih: "Jharkhand",
  "Nagwan Toll Plaza": "Jharkhand",
  Edalhatu: "Jharkhand",
  Jharpokhria: "Odisha",
  Padmanavpur: "Odisha",
  Gurapalli: "Odisha",
  "Saidpur Patedha": "Bihar",
  "Saidpur Patedha Toll": "Bihar",
  "Kharik Toll": "Jharkhand",
  Hazaribag: "Jharkhand",
  "Ghanghri(Kulgo)": "Jharkhand",
  Bellyad: "West Bengal",
  "Halligudi Fee Plaza": "Karnataka",
  "Nalavida Toll": "Karnataka",
  "Kodai Road (Kozhinjipatti)": "Tamil Nadu",
  "Parsoni Khem": "Bihar",
  "Nalavadi Toll Plaza": "Karnataka",
};

let newRows = 0;
let processed = 0;

for (const survey of surveys) {
  if (existingIds.has(survey._id.toString())) {
    processed++;
    progressBar.update(processed);
    continue;
  }

  const state = plazaToStateMap[survey["Plaza Name"]] || "Unknown";
  const videoKey = survey.videoProof;
  const fileName = path.basename(videoKey);
  const localFilePath = path.join(VIDEO_DIR, fileName);

  const assignedSurvey = await FastagSurveyAssigned.findById(survey.surveyId).lean();
  const surveyor = await User.findById(assignedSurvey?.surveyorId).lean();

  // Download video
  try {
    const params = { Bucket: process.env.S3BUCKET_NAME, Key: videoKey };
    const s3Data = await s3.getObject(params).promise();
    fs.writeFileSync(localFilePath, s3Data.Body);
  } catch (err) {
    console.error(`❌ Failed to download ${videoKey}: ${err.message}`);
  }

  // Append new row
  sheet.addRow({
    _id: survey._id.toString(),
    surveyId: survey.surveyId?.toString(),
    surveyorName: surveyor?.name || "Unknown",
    surveyorMobile: surveyor?.mobNum || "Unknown",
    plazaName: survey["Plaza Name"],
    plazaCode: survey["Plaza Code"],
    state,
    startTime: new Date(survey.startTime).toTimeString().split(" ")[0],
    endTime: new Date(survey.endTime).toTimeString().split(" ")[0],
    vehicleCategory: survey.vehicleCategory,
    fuelType: survey.fuelType,
    lat: survey.lat,
    long: survey.long,
    servingTime: survey.servingTime,
    paymentType: survey.paymentType,
    videoProof: fileName,
    createdAt: survey.createdAt,
  });

  newRows++;
  processed++;
  progressBar.update(processed);
}

progressBar.stop();

if (newRows === 0) {
  console.log("📉 No new data to add.");
} else {
  await workbook.xlsx.writeFile(EXCEL_PATH);
  console.log(`📁 Excel updated with ${newRows} new rows`);
}

console.log("✅ Done.");
process.exit(0);

