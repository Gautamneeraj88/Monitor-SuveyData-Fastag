import ExcelJS from "exceljs";
import XLSX from "xlsx";

const surveyFile = "SurveyData.xlsx";
const missingFile = "Missing_Videos_Report.xlsx";
const outputFile = "SurveyData_Processed.xlsx";

async function processExcelFiles() {
  const surveyWorkbook = new ExcelJS.Workbook();
  await surveyWorkbook.xlsx.readFile(surveyFile);
  const surveySheet = surveyWorkbook.worksheets[0];

  // Load missing video IDs using xlsx
  const missingWorkbook = XLSX.readFile(missingFile);
  const missingSheet = missingWorkbook.Sheets[missingWorkbook.SheetNames[0]];
  const missingData = XLSX.utils.sheet_to_json(missingSheet);

  // Create a set of missing video IDs based on "VideoProofKey"
  const missingVideoIds = new Set(
    missingData.map((row) => String(row["VideoProofKey"]).trim()),
  );

  // Identify the "Video File" column index and the "createdAt" column index in the survey sheet
  const headerRow = surveySheet.getRow(1);
  const videoColIndex = headerRow.values.findIndex(
    (val) => val && String(val).toLowerCase().includes("video file"),
  );
  const createdAtColIndex = headerRow.values.findIndex(
    (val) => val && String(val).toLowerCase().includes("createdat"),
  );

  if (videoColIndex === -1) {
    console.error(
      '❌ Could not find a "Video File" column in the survey sheet.',
    );
    return;
  }

  if (createdAtColIndex === -1) {
    console.error(
      '❌ Could not find a "createdAt" column in the survey sheet.',
    );
    return;
  }

  // Collect non-missing rows
  const nonMissingData = [];
  surveySheet.eachRow((row, rowNumber) => {
    const videoId = String(row.getCell(videoColIndex).value || "").trim();
    const isMissing = missingVideoIds.has(videoId);

    // Highlight missing rows (skip header row)
    if (rowNumber !== 1 && isMissing) {
      row.eachCell((cell, colNumber) => {
        // Skip the "createdAt" column and highlight the rest of the row
        if (colNumber !== createdAtColIndex + 1) {
          // Adjust for 1-based index
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF00" }, // bright yellow
          };
        }
      });
    }

    // Save row to new sheet if it's not missing or it's the header
    if (!isMissing || rowNumber === 1) {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cell.value);
      });
      nonMissingData.push(values);
    }
  });

  // Create a new sheet with non-missing rows
  const newSheet = surveyWorkbook.addWorksheet("Non-Missing Videos");
  nonMissingData.forEach((row) => {
    newSheet.addRow(row);
  });

  // Write updated workbook
  await surveyWorkbook.xlsx.writeFile(outputFile);
  console.log(`✅ Done. Output saved as: ${outputFile}`);
}

processExcelFiles().catch((err) => {
  console.error("❌ Error processing files:", err);
});
