import mongoose from "mongoose";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js";
import dotenv from "dotenv";
import xlsx from "xlsx";
import Table from "cli-table3";
import fs from "fs";
import { format } from "date-fns";
import axios from "axios";
import * as cheerio from "cheerio";

dotenv.config();

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

    return {
      state: row.find("td").eq(1).text().trim() || "Unknown",
      nhNo: row.find("td").eq(2).text().trim() || "Unknown",
      location: row.find("td").eq(4).text().trim() || "Unknown",
      sectionStretch: row.find("td").eq(5).text().trim() || "Unknown",
    };
  } catch (err) {
    console.error(
      `❌ Error fetching plaza info for ${plazaName}: ${err.message}`,
    );
    return {
      state: "Unknown",
      nhNo: "Unknown",
      location: "Unknown",
      sectionStretch: "Unknown",
    };
  }
}

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

async function fetchSurveyData() {
  const rawSurveys = await FastagSurveyAssigned.find({})
    .populate("surveyorId", "name mobNum")
    .lean();

  const grouped = {};

  rawSurveys.forEach((doc) => {
    const dateKey = format(new Date(doc.createdAt), "dd-MM-yyyy");
    const key = `${dateKey}__${doc["Plaza Name"]}__${doc["Plaza Code"]}__${doc.surveyorId?.name || "-"}__${doc.surveyorId?.mobNum || "-"}`;

    if (!grouped[key]) {
      grouped[key] = {
        plazaName: doc["Plaza Name"],
        plazaCode: doc["Plaza Code"],
        surveyorName: doc.surveyorId?.name || "-",
        mobNum: doc.surveyorId?.mobNum || "-",
        pendingCount: 0,
        completedCount: 0,
        draftedCount: 0,
        createdAt: dateKey,
      };
    }

    if (doc.status === "Pending") grouped[key].pendingCount += 1;
    else if (doc.status === "Completed") grouped[key].completedCount += 1;
    else if (doc.status === "Drafted") grouped[key].draftedCount += 1;
  });

  const result = Object.values(grouped).filter(
    (item) => !["Neeraj Gautam", "Pritam Mandle"].includes(item.surveyorName),
  );

  return result;
}

function writeToExcel(data) {
  const filePath = "./surveyData.xlsx";
  let workbook;
  let worksheet;
  let existingData = [];

  const header = [
    "Plaza Name",
    "State",
    "NH-No.",
    "Plaza Code",
    "Location",
    "Section/Stretch",
    "Surveyor Name",
    "Mobile Number",
    "Pending",
    "Completed",
    "Drafted",
    "CreatedAt",
  ];

  if (fs.existsSync(filePath)) {
    workbook = xlsx.readFile(filePath);
    worksheet = workbook.Sheets["Status"];
    existingData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  } else {
    workbook = xlsx.utils.book_new();
    worksheet = xlsx.utils.aoa_to_sheet([header]);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Status");
    existingData = [header];
  }

  const rows = existingData.slice(1);

  data.forEach((entry) => {
    const index = rows.findIndex(
      (row) =>
        row[0] === entry.plazaName &&
        row[3] === entry.plazaCode &&
        row[6] === entry.surveyorName &&
        row[7] === entry.mobNum &&
        row[11] === entry.createdAt,
    );

    const newRow = [
      entry.plazaName,
      entry.state || "-",
      entry.nhNo || "-",
      entry.plazaCode,
      entry.location || "-",
      entry.sectionStretch || "-",
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
      entry.draftedCount,
      entry.createdAt || "-",
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
}

function showOnTerminal(data) {
  const table = new Table({
    head: [
      "Plaza",
      "State",
      "NH-No.",
      "Location",
      "Section/Stretch",
      "Surveyor",
      "Mobile",
      "Pending",
      "Completed",
      "Drafted",
      "Date",
    ],
    colWidths: [20, 12, 8, 20, 25, 20, 12, 8, 10, 8, 12],
  });

  let totalPending = 0;
  let totalCompleted = 0;
  let totalDrafted = 0;

  data.forEach((entry) => {
    table.push([
      entry.plazaName,
      entry.state,
      entry.nhNo,
      entry.location,
      entry.sectionStretch,
      entry.surveyorName,
      entry.mobNum,
      entry.pendingCount,
      entry.completedCount,
      entry.draftedCount,
      entry.createdAt,
    ]);

    totalPending += entry.pendingCount;
    totalCompleted += entry.completedCount;
    totalDrafted += entry.draftedCount;
  });

  table.push([
    { colSpan: 7, content: "TOTAL", hAlign: "center" },
    totalPending,
    totalCompleted,
    totalDrafted,
    "",
  ]);

  console.clear();
  console.log("📊 Survey Status Monitor (Live)");
  console.log(table.toString());
}

async function main() {
  try {
    await connectDB();
    const surveys = await fetchSurveyData();

    const formattedData = [];

    for (const s of surveys) {
      const details = await fetchPlazaDetails(s.plazaName);
      formattedData.push({
        plazaName: s.plazaName,
        state: details.state,
        nhNo: details.nhNo,
        plazaCode: s.plazaCode,
        location: details.location,
        sectionStretch: details.sectionStretch,
        pendingCount: s.pendingCount,
        completedCount: s.completedCount,
        draftedCount: s.draftedCount,
        surveyorName: s.surveyorName,
        mobNum: s.mobNum,
        createdAt: s.createdAt,
      });
    }

    showOnTerminal(formattedData);
    writeToExcel(formattedData);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

main();
