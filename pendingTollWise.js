import FastagSurveyAssigned from "./models/fastagSuveyAssigned.schema.js";
import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import cliProgress from "cli-progress";
import User from "./models/user.schema.js";
import ExcelJS from "exceljs";

dotenv.config();

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

const getPendingTollWise = async () => {
  await connectDB().then(async () => {
    let exportedData = {};
    try {
      const pendingTollWise = await FastagSurveyAssigned.find({
        status: "Pending",
      });
      const checkBar = new cliProgress.SingleBar(
        {
          format:
            "🔍 Checking videos [{bar}] {percentage}% | {value}/{total} processed",
        },
        cliProgress.Presets.shades_classic
      );
      checkBar.start(pendingTollWise.length, 0);
      for (let i = 0; i < pendingTollWise.length; i++) {
        const user = await User.findById(pendingTollWise[i].surveyorId).select(
          "name"
        );
        if (!user) {
          console.error(
            "User not found for ID:",
            pendingTollWise[i].surveyorId
          );
          continue;
        }
        const userName = user.name;
        if (
          Object.keys(exportedData).includes(pendingTollWise[i]["Plaza Name"])
        ) {
          exportedData[pendingTollWise[i]["Plaza Name"]] = {
            "Plaza Name": pendingTollWise[i]["Plaza Name"],
            "Plaza Code": pendingTollWise[i]["Plaza Code"],
            "Pending Count":
              exportedData[pendingTollWise[i]["Plaza Name"]]["Pending Count"] +
              1,
            surveyorName: userName,
            startDate: pendingTollWise[i].startDate,
          };
        } else {
          exportedData[pendingTollWise[i]["Plaza Name"]] = {
            "Plaza Name": pendingTollWise[i]["Plaza Name"],
            "Plaza Code": pendingTollWise[i]["Plaza Code"],
            "Pending Count": 1,
            surveyorName: userName,
            startDate: pendingTollWise[i].startDate,
          };
        }
        checkBar.increment();
      }
      console.log("Pending Tolls:", Object.values(exportedData));
      //write the data to a file
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Pending Tolls");

      // Add header row
      worksheet.columns = [
        { header: "Plaza Name", key: "plazaName", width: 30 },
        { header: "Plaza Code", key: "plazaCode", width: 15 },
        { header: "Pending Count", key: "pendingCount", width: 15 },
        { header: "Surveyor Name", key: "surveyorName", width: 25 },
        { header: "Start Date", key: "startDate", width: 20 },
      ];

      // Add data rows
      Object.values(exportedData).forEach((data) => {
        worksheet.addRow({
          plazaName: data["Plaza Name"],
          plazaCode: data["Plaza Code"],
          pendingCount: data["Pending Count"],
          surveyorName: data["surveyorName"],
          startDate: data["startDate"],
        });
      });

      // Write to file
      const filePath = "pendingTollWise.xlsx";
      await workbook.xlsx.writeFile(filePath);
      console.log(`Data written to ${filePath}`);
      // console.log(pendingTollWise);
      checkBar.stop();
    } catch (error) {
      console.error("Error fetching pending tolls:", error);
    } finally {
      mongoose.connection.close();
    }
  });
};

getPendingTollWise().catch((error) => {
  console.error("Error in getPendingTollWise:", error);
  mongoose.connection.close();
});
