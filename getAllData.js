import mongoose from "mongoose";
import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import User from "./models/user.schema.js"; // Assuming you save user model here
import dotenv from "dotenv";
import xlsx from "xlsx";
import Table from "cli-table3";
import fs from "fs";
import { format } from "date-fns";

dotenv.config();

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
        createdAt: dateKey,
      };
    }

    if (doc.status === "Pending") grouped[key].pendingCount += 1;
    else if (doc.status === "Completed") grouped[key].completedCount += 1;
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
    "Plaza Code",
    "Surveyor Name",
    "Mobile Number",
    "Pending",
    "Completed",
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
        row[2] === entry.plazaCode &&
        row[3] === entry.surveyorName &&
        row[4] === entry.mobNum &&
        row[7] === entry.createdAt,
    );

    const newRow = [
      entry.plazaName,
      entry.state || "-",
      entry.plazaCode,
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
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
      "Plaza Name",
      "State",
      "Plaza Code",
      "Surveyor",
      "Mobile",
      "Pending",
      "Completed",
      "CreatedAt",
    ],
    colWidths: [25, 15, 15, 25, 15, 10, 10, 20],
  });

  let totalPending = 0;
  let totalCompleted = 0;

  data.forEach((entry) => {
    table.push([
      entry.plazaName,
      entry.state || "-",
      entry.plazaCode || "-",
      entry.surveyorName || "-",
      entry.mobNum || "-",
      entry.pendingCount,
      entry.completedCount,
      entry.createdAt || "-",
    ]);

    totalPending += entry.pendingCount;
    totalCompleted += entry.completedCount;
  });

  table.push([
    { colSpan: 5, content: "TOTAL", hAlign: "center" },
    totalPending,
    totalCompleted,
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

    const formattedData = surveys.map((s) => ({
      plazaName: s.plazaName,
      state: plazaToStateMap[s.plazaName] || "-",
      plazaCode: s.plazaCode,
      pendingCount: s.pendingCount,
      completedCount: s.completedCount,
      surveyorName: s.surveyorName,
      mobNum: s.mobNum,
      createdAt: s.createdAt,
    }));

    showOnTerminal(formattedData);
    writeToExcel(formattedData);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    mongoose.disconnect();
  }
}

main();
