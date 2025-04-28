import mongoose from "mongoose";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js"; // Assuming you save user model here
import dotenv from "dotenv";
import xlsx from "xlsx";
import Table from "cli-table3";
import fs from "fs";

dotenv.config();

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

// Fetch survey data and populate Surveyor
async function fetchSurveyData() {
  const surveys = await FastagSurveyAssigned.aggregate([
    {
      $group: {
        _id: {
          plazaName: "$Plaza Name",
          plazaCode: "$Plaza Code",
          surveyorId: "$surveyorId",
        },
        pendingCount: {
          $sum: {
            $cond: [{ $eq: ["$status", "Pending"] }, 1, 0],
          },
        },
        completedCount: {
          $sum: {
            $cond: [{ $eq: ["$status", "Completed"] }, 1, 0],
          },
        },
      },
    },
    {
      $lookup: {
        from: "users", // collection name (in lowercase usually)
        localField: "_id.surveyorId",
        foreignField: "_id",
        as: "surveyorDetails",
      },
    },
    {
      $unwind: {
        path: "$surveyorDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        plazaName: "$_id.plazaName",
        plazaCode: "$_id.plazaCode",
        surveyorId: "$_id.surveyorId",
        pendingCount: 1,
        completedCount: 1,
        surveyorName: "$surveyorDetails.name",
        mobNum: "$surveyorDetails.mobNum",
      },
    },
  ]);

  return surveys;
}

// Write to Excel (smart updating)
function writeToExcel(data) {
  const filePath = "./surveyStatus.xlsx";
  let workbook;
  let worksheet;
  let existingData = [];

  if (fs.existsSync(filePath)) {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets["Status"];
    existingData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  } else {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.aoa_to_sheet([["Plaza Name", "Plaza Code", "Surveyor Name", "Mobile Number", "Pending", "Completed", "Timestamp"]]);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Status");
    existingData = [["Plaza Name", "Plaza Code", "Surveyor Name", "Mobile Number", "Pending", "Completed", "Timestamp"]];
  }

  const header = existingData[0];
  const rows = existingData.slice(1);

  const updatedRows = data.map(entry => {
    const index = rows.findIndex(row =>
      row[0] === entry.plazaName &&
      row[1] === entry.plazaCode &&
      row[2] === entry.surveyorName &&
      row[3] === entry.mobNum
    );

    const newRow = [
      entry.plazaName,
      entry.plazaCode,
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
      new Date().toISOString()
    ];

    if (index !== -1) {
      rows[index] = newRow;
    } else {
      rows.push(newRow);
    }

    return newRow;
  });

  const newSheet = xlsx.utils.aoa_to_sheet([header, ...rows]);
  workbook.Sheets["Status"] = newSheet;
  xlsx.writeFile(workbook, filePath);
}

// Display live table
function showOnTerminal(data) {
    const table = new Table({
      head: ["Plaza Name", "Plaza Code", "Surveyor", "Mobile", "Pending", "Completed"],
      colWidths: [30, 20, 25, 20, 10, 10],
    });
  
    let totalPending = 0;
    let totalCompleted = 0;
  
    data.forEach(entry => {
      table.push([
        entry.plazaName,
        entry.plazaCode || "-",
        entry.surveyorName || "-",
        entry.mobNum || "-",
        entry.pendingCount,
        entry.completedCount,
      ]);
  
      totalPending += entry.pendingCount;
      totalCompleted += entry.completedCount;
    });
  
    // Add a footer row
    table.push([
      { colSpan: 4, content: "TOTAL", hAlign: "center" },
      totalPending,
      totalCompleted,
    ]);
  
    console.clear();
    console.log("📊 Survey Status Monitor (Live)");
    console.log(table.toString());
  }
  
async function main() {
  await connectDB();

  setInterval(async () => {
    const surveys = await fetchSurveyData();

    const formattedData = surveys.map(s => ({
      plazaName: s.plazaName,
      plazaCode: s.plazaCode,
      pendingCount: s.pendingCount,
      completedCount: s.completedCount,
      surveyorId: s.surveyorId,
      surveyorName: s.surveyorName,
      mobNum: s.mobNum,
    }));

    showOnTerminal(formattedData);
    writeToExcel(formattedData);
  }, 5000); // Every 5 seconds
}

main();
