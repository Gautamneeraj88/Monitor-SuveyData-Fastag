import mongoose from "mongoose";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import cliProgress from "cli-progress";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";
import FastagSurveyData from "./models/fastagSurveyData.js";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js";

// Load env variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MongoDB connection
try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");
} catch (error) {
  console.error("❌ MongoDB connection error:", error);
  process.exit(1);
}

// Paths
const OUTPUT_DIR = path.join(__dirname, "./output");
const EXCEL_PATH = path.join(OUTPUT_DIR, "SurveyData.xlsx");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Excel setup
const workbook = new ExcelJS.Workbook();
let sheet;
let existingIds = new Set();
let lastCreatedAt = null;

if (fs.existsSync(EXCEL_PATH)) {
  console.log("📥 Loading existing Excel...");
  try {
    await workbook.xlsx.readFile(EXCEL_PATH);
    sheet = workbook.getWorksheet("Survey Data");

    if (!sheet) {
      console.log("⚠️ 'Survey Data' worksheet not found, creating new one");
      sheet = workbook.addWorksheet("Survey Data");
      setupWorksheetColumns(sheet);
    } else {
      const headerRow = sheet.getRow(1);
      const columnIndexMap = {};
      headerRow.eachCell((cell, colNumber) => {
        columnIndexMap[cell.value] = colNumber;
      });

      if (!columnIndexMap["_id"]) {
        console.error("❌ Invalid Excel format: '_id' column not found");
        setupWorksheetColumns(sheet);
      } else {
        sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
          if (rowNum === 1) return;
          const rowId = row.getCell(columnIndexMap["_id"]).value;
          if (rowId) existingIds.add(rowId.toString());

          const createdAtCell = row.getCell(columnIndexMap["createdAt"]).value;
          if (createdAtCell) {
            const createdAt = new Date(createdAtCell);
            if (!lastCreatedAt || createdAt > lastCreatedAt) {
              lastCreatedAt = createdAt;
            }
          }
        });

        console.log(`🔍 Found ${existingIds.size} existing entries`);
        if (lastCreatedAt) {
          console.log(`📅 Last entry date: ${lastCreatedAt.toISOString()}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error reading Excel file:", error);
    console.log("🔄 Creating new Excel file");
    sheet = workbook.addWorksheet("Survey Data");
    setupWorksheetColumns(sheet);
  }
} else {
  sheet = workbook.addWorksheet("Survey Data");
  setupWorksheetColumns(sheet);
}

function setupWorksheetColumns(worksheet) {
  worksheet.columns = [
    { header: "_id", key: "_id", width: 24 },
    { header: "surveyId", key: "surveyId", width: 24 },
    { header: "Surveyor Name", key: "surveyorName", width: 30 },
    { header: "Surveyor Mobile", key: "surveyorMobile", width: 20 },
    { header: "Plaza Name", key: "plazaName", width: 30 },
    { header: "Plaza Code", key: "plazaCode", width: 20 },
    { header: "State", key: "state", width: 20 },
    { header: "Location", key: "location", width: 20 },
    { header: "Start Time", key: "startTime", width: 20 },
    { header: "End Time", key: "endTime", width: 20 },
    { header: "Video Duration (s)", key: "videoDuration", width: 20 },
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

async function fetchPlazaDetails(plazaName) {
  try {
    const response = await axios.post(
      "https://tis.nhai.gov.in/TollPlazaService.asmx/GetTollPlazaInfoGrid",
      { TollName: plazaName },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );

    const html = response.data.d;
    const $ = cheerio.load(html);
    const row = $("table.tab tr").eq(1);

    const state = row.find("td").eq(1).text().trim();
    const location = row.find("td").eq(4).text().trim();

    return {
      state: state || "Unknown",
      location: location || "Unknown",
    };
  } catch (err) {
    console.error(
      `❌ Error fetching plaza info for ${plazaName}: ${err.message}`,
    );
    return {
      state: "Unknown",
      location: "Unknown",
    };
  }
}

// Fetch new survey data
const query = {};
if (lastCreatedAt) {
  query.createdAt = { $gt: lastCreatedAt };
}

console.log("📦 Fetching new survey data...");
let surveys = [];
try {
  surveys = await FastagSurveyData.find(query).lean();
  console.log(`📊 Total new surveys: ${surveys.length}`);
} catch (error) {
  console.error("❌ Error fetching survey data:", error);
  process.exit(1);
}

if (surveys.length === 0) {
  console.log("✅ No new surveys to process. Exiting.");
  process.exit(0);
}

const progressBar = new cliProgress.SingleBar({
  format: "⏳ Processing |{bar}| {percentage}% || {value}/{total} Entries",
  barCompleteChar: "█",
  barIncompleteChar: "-",
  hideCursor: true,
});
progressBar.start(surveys.length, 0);

let processedCount = 0;
const errors = [];

for (let survey of surveys) {
  try {
    if (existingIds.has(survey._id.toString())) {
      progressBar.increment();
      continue;
    }

    let assignedSurvey;
    let surveyor;

    try {
      assignedSurvey = await FastagSurveyAssigned.findById(
        survey.surveyId,
      ).lean();
      if (assignedSurvey?.surveyorId) {
        surveyor = await User.findById(assignedSurvey.surveyorId).lean();
      }
    } catch (err) {
      console.error(
        `❌ Error fetching assigned survey/surveyor: ${err.message}`,
      );
    }

    const plazaName = survey["Plaza Name"] || "Unknown";
    const { state, location } = await fetchPlazaDetails(plazaName);

    const startTimeObj =
      survey.startTime instanceof Date && !isNaN(survey.startTime)
        ? survey.startTime
        : new Date();
    const endTimeObj =
      survey.endTime instanceof Date && !isNaN(survey.endTime)
        ? survey.endTime
        : new Date();

    const videoDuration =
      endTimeObj >= startTimeObj
        ? Math.round((endTimeObj - startTimeObj) / 1000)
        : 0;

    const fileName = survey.videoProof || "N/A";

    sheet.addRow({
      _id: survey._id.toString(),
      surveyId: survey.surveyId?.toString() || "N/A",
      surveyorName: surveyor?.name || "Unknown",
      surveyorMobile: surveyor?.mobNum || "Unknown",
      plazaName,
      plazaCode: survey["Plaza Code"] || "Unknown",
      state,
      location,
      startTime: startTimeObj.toTimeString().split(" ")[0],
      endTime: endTimeObj.toTimeString().split(" ")[0],
      videoDuration,
      vehicleCategory: survey.vehicleCategory || "Unknown",
      fuelType: survey.fuelType || "Unknown",
      lat: survey.lat || "N/A",
      long: survey.long || "N/A",
      servingTime: survey.servingTime || "0",
      paymentType: survey.paymentType || "Unknown",
      videoProof: fileName,
      createdAt: survey.createdAt,
    });

    processedCount++;
    progressBar.increment();
  } catch (error) {
    errors.push(`Error processing survey ${survey._id}: ${error.message}`);
  }
}

// Save Excel
try {
  await workbook.xlsx.writeFile(EXCEL_PATH);
  console.log(`\n💾 Excel file saved at: ${EXCEL_PATH}`);
  console.log(`📊 Processed ${processedCount} new entries`);
} catch (error) {
  console.error(`\n❌ Error saving Excel file: ${error.message}`);
}

// Summary
if (errors.length > 0) {
  console.log(`\n⚠️ Encountered ${errors.length} errors during processing:`);
  errors.slice(0, 5).forEach((err) => console.error(`  - ${err}`));
  if (errors.length > 5) {
    console.log(`  ... and ${errors.length - 5} more errors`);
  }
}

process.exit(0);
