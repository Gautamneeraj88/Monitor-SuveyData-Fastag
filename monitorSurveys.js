import mongoose from "mongoose";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js";
import dotenv from "dotenv";
import xlsx from "xlsx";
import Table from "cli-table3";
import fs from "fs";
import path from "path";
import { format } from "date-fns";

dotenv.config();

// State mapping
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

// MongoDB connection
async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

// Excel file path
const EXCEL_PATH = "./surveyStatus.xlsx";
const LOG_FILE = "./monitor.log";

// Logger function
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(message);
}

// Load last tracked data from Excel
function loadLastTrackedData() {
  if (!fs.existsSync(EXCEL_PATH)) {
    return {
      lastId: null,
      lastUpdatedAt: null,
      trackedIds: new Set(),
    };
  }

  try {
    const workbook = xlsx.readFile(EXCEL_PATH);
    const worksheet = workbook.Sheets["Status"];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return {
        lastId: null,
        lastUpdatedAt: null,
        trackedIds: new Set(),
      };
    }

    // Get the last MongoDB document ID and updatedAt timestamp
    const trackedIds = new Set();
    let lastId = null;
    let lastUpdatedAt = null;

    data.forEach((row) => {
      if (row.documentId) {
        trackedIds.add(row.documentId);

        // Find the most recent entry
        const rowUpdatedAt = row.updatedAt ? new Date(row.updatedAt) : null;
        if (!lastUpdatedAt || (rowUpdatedAt && rowUpdatedAt > lastUpdatedAt)) {
          lastUpdatedAt = rowUpdatedAt;
          lastId = row.documentId;
        }
      }
    });

    return { lastId, lastUpdatedAt, trackedIds };
  } catch (error) {
    log(`❌ Error reading Excel: ${error.message}`);
    return {
      lastId: null,
      lastUpdatedAt: null,
      trackedIds: new Set(),
    };
  }
}

// Fetch only new or updated survey data
async function fetchSurveyData(lastUpdatedAt, trackedIds) {
  const query = {};

  // If we have a last update timestamp, filter by it
  if (lastUpdatedAt) {
    query.$or = [
      { updatedAt: { $gt: lastUpdatedAt } },
      { createdAt: { $gt: lastUpdatedAt } },
    ];
  }

  const surveys = await FastagSurveyAssigned.aggregate([
    {
      $match: query,
    },
    {
      $group: {
        _id: {
          plazaName: "$Plaza Name",
          plazaCode: "$Plaza Code",
          surveyorId: "$surveyorId",
          createdAt: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          documentId: "$_id",
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ["$status", "Pending"] }, 1, 0] },
        },
        completedCount: {
          $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] },
        },
        updatedAt: { $max: "$updatedAt" },
        latestStatus: { $last: "$status" },
      },
    },
    {
      $lookup: {
        from: "users",
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
        _id: 0,
        plazaName: "$_id.plazaName",
        plazaCode: "$_id.plazaCode",
        surveyorId: "$_id.surveyorId",
        documentId: "$_id.documentId",
        pendingCount: 1,
        completedCount: 1,
        createdAt: "$_id.createdAt",
        updatedAt: 1,
        latestStatus: 1,
        surveyorName: "$surveyorDetails.name",
        mobNum: "$surveyorDetails.mobNum",
      },
    },
    {
      $match: {
        surveyorName: { $nin: ["Neeraj Gautam", "Pritam Mandle"] },
      },
    },
    {
      $sort: { updatedAt: -1 },
    },
  ]);

  return surveys;
}

// Write to Excel with document IDs
function writeToExcel(data) {
  const filePath = EXCEL_PATH;
  let workbook;
  let worksheet;
  let existingData = [];

  // Set up header row
  const header = [
    "Plaza Name",
    "State",
    "Plaza Code",
    "Surveyor Name",
    "Mobile Number",
    "Pending",
    "Completed",
    "Latest Status",
    "Created Date",
    "Last Updated",
    "documentId", // MongoDB _id
  ];

  if (fs.existsSync(filePath)) {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets["Status"];
    existingData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    // Ensure header has documentId column
    if (existingData[0] && !existingData[0].includes("documentId")) {
      existingData[0].push("documentId");
    }
  } else {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.aoa_to_sheet([header]);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Status");
    existingData = [header];
  }

  const rows = existingData.slice(1);

  // Update or add rows
  data.forEach((entry) => {
    const documentId = entry.documentId.toString();

    // Find if this document already exists in the Excel
    const index = rows.findIndex((row) => row[row.length - 1] === documentId);

    const updatedAt = entry.updatedAt ? new Date(entry.updatedAt) : new Date();
    const formattedDate = format(updatedAt, "yyyy-MM-dd HH:mm:ss");

    const newRow = [
      entry.plazaName,
      plazaToStateMap[entry.plazaName] || "-",
      entry.plazaCode,
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
      entry.latestStatus || "-",
      entry.createdAt,
      formattedDate,
      documentId,
    ];

    if (index !== -1) {
      rows[index] = newRow;
    } else {
      rows.push(newRow);
    }
  });

  const newSheet = xlsx.utils.aoa_to_sheet([header, ...rows]);
  workbook.Sheets["Status"] = newSheet;
  xlsx.writeFile(workbook, filePath);

  return rows.length;
}

// Display live table in terminal
function showOnTerminal(data) {
  const table = new Table({
    head: [
      "Plaza Name",
      "State",
      "Plaza Code",
      "Surveyor",
      "Mobile",
      "Pending",
      "Completed",
      "Latest Status",
      "Last Updated",
    ],
    colWidths: [25, 15, 15, 25, 15, 10, 10, 15, 20],
  });

  let totalPending = 0;
  let totalCompleted = 0;

  // Display only the latest 20 entries for better visibility
  const recentData = data.slice(0, 20);

  recentData.forEach((entry) => {
    const updatedAt = entry.updatedAt
      ? format(new Date(entry.updatedAt), "HH:mm:ss")
      : "-";

    table.push([
      entry.plazaName,
      plazaToStateMap[entry.plazaName] || "-",
      entry.plazaCode || "-",
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
      entry.latestStatus || "-",
      updatedAt,
    ]);

    totalPending += entry.pendingCount;
    totalCompleted += entry.completedCount;
  });

  table.push([
    { colSpan: 5, content: "TOTAL", hAlign: "center" },
    totalPending,
    totalCompleted,
    "",
    "",
  ]);

  console.clear();
  console.log(
    `📊 Survey Status Monitor (Live) - ${format(new Date(), "yyyy-MM-dd HH:mm:ss")}`,
  );
  console.log(`Showing latest ${recentData.length} of ${data.length} entries`);
  console.log(table.toString());

  return { totalPending, totalCompleted };
}

// Main monitoring function
async function main() {
  try {
    await connectDB();
    log("Starting real-time survey monitoring...");

    // Initialize variables for tracking
    const { lastUpdatedAt, trackedIds } = loadLastTrackedData();

    if (lastUpdatedAt) {
      log(`Resuming from last update: ${lastUpdatedAt.toISOString()}`);
    } else {
      log("First run - will fetch all survey data");
    }

    // Initial data fetch
    let allData = await fetchSurveyData(lastUpdatedAt, trackedIds);
    let rowCount = writeToExcel(allData);

    if (allData.length > 0) {
      const { totalPending, totalCompleted } = showOnTerminal(allData);
      log(
        `Initial data loaded: ${allData.length} entries (${totalPending} pending, ${totalCompleted} completed)`,
      );
    } else {
      log("No initial data found");
    }

    // Setup interval for real-time updates
    let lastRefreshTime = new Date();

    setInterval(async () => {
      try {
        // Fetch only new or updated records since the last check
        const newData = await fetchSurveyData(lastRefreshTime, trackedIds);
        lastRefreshTime = new Date();

        if (newData.length > 0) {
          // Add new entries to our tracked data
          newData.forEach((item) => {
            // Find if this entry already exists in our dataset
            const existingIndex = allData.findIndex(
              (existing) =>
                existing.documentId.toString() === item.documentId.toString(),
            );

            if (existingIndex >= 0) {
              // Update existing entry
              allData[existingIndex] = item;
            } else {
              // Add new entry
              allData.push(item);
            }
          });

          // Sort by most recent updates
          allData.sort((a, b) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(0);
            const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(0);
            return dateB - dateA;
          });

          // Update Excel
          rowCount = writeToExcel(newData);

          // Update terminal display
          const { totalPending, totalCompleted } = showOnTerminal(allData);
          log(
            `Updated with ${newData.length} new entries (Total: ${allData.length}, Pending: ${totalPending}, Completed: ${totalCompleted})`,
          );
        }
      } catch (error) {
        log(`Error in refresh: ${error.message}`);
      }
    }, 5000); // Refresh every 5 seconds
  } catch (error) {
    log(`❌ Error: ${error.message}`);
    mongoose.disconnect();
  }
}

// Initialize the monitoring
main();
