import { Schema, Types, model } from "mongoose";

const fastagSurveySchema = new Schema(
  {
    surveyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "FastFastagSurveyAssigned",
    },
    lat: {
      type: Number,
      require: true,
    },
    long: {
      type: Number,
      required: true,
    },
    "Plaza Name": {
      type: String,
    },
    "Plaza Code": {
      type: String,
    },

    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    vehicleCategory: {
      type: String,
      enum: [
        "Car/Jeep/Van/MV",
        "LCV/LGV/Mini Bus",
        "2 axle",
        "3 axle Commercial",
        "4 to 6 axle",
        "Over sized(7 axle)",
      ],
      required: true,
    },

    fuelType: {
      type: String,
      enum: ["Diesel", "Petrol", "CNG", "EV", "NA"],
      required: true,
    },
    videoProof: {
      type: String,
      required: true,
    },

    servingTime: {
      type: Number,
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["fastag", "cash"],
    },
  },
  { timestamps: true },
);

const FastagSurveyData = model("FastagSurveyData", fastagSurveySchema);
export default FastagSurveyData;
