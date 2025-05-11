import FastagSurveyData from "./models/fastagSurveyData.js";
import mongoose from "mongoose";

import dotenv from "dotenv";

dotenv.config();
async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("✅ Connected to MongoDB");
}

const run = async () => {
  await connectDB().then(async () => {
    try {
      await FastagSurveyData.deleteMany({
        surveyId: {
          $in: [
            "680f302b8a5e3fea7a5e1a18",
            "680f302b8a5e3fea7a5e1a19",
            "680f302b8a5e3fea7a5e1a1a",
            "680f302b8a5e3fea7a5e1a1b",
            "680f302b8a5e3fea7a5e1a1c",
            "680f302b8a5e3fea7a5e1a1d",
            "680f302b8a5e3fea7a5e1a1e",
            "680f302b8a5e3fea7a5e1a1f",
            "680f302b8a5e3fea7a5e1a20",
            "680f302b8a5e3fea7a5e1a21",
            "6812440357751d6d86491bfb",
            "6812440357751d6d86491bfc",
            "6812440357751d6d86491bfd",
            "6812440357751d6d86491bfe",
            "6812440357751d6d86491bff",
            "6812440357751d6d86491c00",
            "6812440357751d6d86491c01",
            "6812440357751d6d86491c02",
            "6812440357751d6d86491c03",
            "6812440357751d6d86491c04",
            "6812440357751d6d86491c05",
            "6812440357751d6d86491c06",
            "6812440357751d6d86491c07",
            "6812440357751d6d86491c08",
            "6812440357751d6d86491c09",
            "6812440357751d6d86491c0a",
            "6812440357751d6d86491c0b",
            "6812440357751d6d86491c0c",
            "6812440357751d6d86491c0d",
            "6812440357751d6d86491c0e",
            "68139e3354962e68ba539c29",
            "68139e3354962e68ba539c2a",
            "68139e3354962e68ba539c2b",
            "68139e3354962e68ba539c2c",
            "68139e3354962e68ba539c2d",
            "68139e3354962e68ba539c2e",
            "68139e3354962e68ba539c2f",
            "68139e3354962e68ba539c30",
            "68139e3354962e68ba539c31",
            "68139e3354962e68ba539c32",
            "68151ead54962e68ba53d335",
            "68151ead54962e68ba53d336",
            "68151ead54962e68ba53d337",
            "68151ead54962e68ba53d338",
            "68151ead54962e68ba53d339",
            "68151ead54962e68ba53d33a",
            "68151ead54962e68ba53d33b",
            "68151ead54962e68ba53d33c",
            "68151ead54962e68ba53d33d",
            "68151ead54962e68ba53d33e",
            "68178dae73a338909d9ecb19",
            "68178dae73a338909d9ecb1a",
            "68178dae73a338909d9ecb1b",
            "68178dae73a338909d9ecb1c",
            "68178dae73a338909d9ecb1d",
            "68178dae73a338909d9ecb1e",
            "68178dae73a338909d9ecb1f",
            "68178dae73a338909d9ecb20",
            "68178dae73a338909d9ecb21",
            "68178dae73a338909d9ecb22",
            "681a348c73a338909d9f68b2",
            "681a348c73a338909d9f68b3",
            "681a348c73a338909d9f68b4",
            "681a348c73a338909d9f68b5",
            "681a348c73a338909d9f68b6",
            "681a348c73a338909d9f68b7",
            "681a348c73a338909d9f68b8",
            "681a348c73a338909d9f68b9",
            "681a348c73a338909d9f68ba",
            "681a348c73a338909d9f68bb",
          ],
        },
      });
    } catch (err) {
      console.error("❌ Error connecting to MongoDB:", err);
      process.exit(1);
    }
  });
};
run()
  .then(() => {
    console.log("✅ Deleted survey data successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error deleting survey data:", error);
    process.exit(1);
  });
