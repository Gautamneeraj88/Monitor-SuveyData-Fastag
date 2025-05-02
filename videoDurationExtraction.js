import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

// Constants
const INPUT_EXCEL = "./output/SurveyData.xlsx";
const OUTPUT_EXCEL = "./output/SurveyData_WithDuration.xlsx";
const VIDEO_DIR = "./output/videos";

// Helper: Get video duration
function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
}

console.log("📖 Reading Excel...");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(INPUT_EXCEL);
const sheet = workbook.getWorksheet("Survey Data");

if (!sheet) {
  throw new Error('❌ Worksheet "Survey Data" not found.');
}

// Normalize headers
const headerRow = sheet.getRow(1);
const headers = headerRow.values.map((v) =>
  typeof v === "string" ? v.trim().toLowerCase() : "",
);

let videoFileColIndex = headers.findIndex((h) => h === "video file");
let durationColIndex = headers.findIndex((h) => h === "video duration (s)");

// If duration column doesn't exist, add it
if (durationColIndex === -1) {
  durationColIndex = headerRow.cellCount + 1;
  headerRow.getCell(durationColIndex).value = "Video Duration (s)";
  headerRow.commit();
}

if (videoFileColIndex === -1) {
  throw new Error("❌ 'Video File' column not found in the Excel sheet.");
}

console.log("⏱ Calculating video durations...");

const totalRows = sheet.rowCount - 1;
let processed = 0;
let lastPercent = -1;

for (let i = 2; i <= sheet.rowCount; i++) {
  const row = sheet.getRow(i);
  const fileName = row.getCell(videoFileColIndex).value;

  if (!fileName || typeof fileName !== "string") {
    row.getCell(durationColIndex).value = "Missing Filename";
    row.commit();
    continue;
  }

  const videoPath = path.join(VIDEO_DIR, fileName);
  let durationValue = "Not Found";

  if (fs.existsSync(videoPath)) {
    try {
      const duration = await getVideoDuration(videoPath);
      durationValue = parseFloat(duration.toFixed(2));
    } catch (err) {
      console.error(`❌ Error reading ${fileName}: ${err.message}`);
      durationValue = "Error";
    }
  } else {
    console.warn(`⚠️ Missing video: ${fileName}`);
  }

  row.getCell(durationColIndex).value = durationValue;
  row.commit();

  // Progress
  processed++;
  const percent = Math.floor((processed / totalRows) * 100);
  if (percent % 10 === 0 && percent !== lastPercent) {
    console.log(`✅ Progress: ${percent}% (${processed}/${totalRows})`);
    lastPercent = percent;
  }
}

await workbook.xlsx.writeFile(OUTPUT_EXCEL);
console.log(`✅ Excel with durations saved to: ${OUTPUT_EXCEL}`);
