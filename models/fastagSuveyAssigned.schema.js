import { Schema, model } from "mongoose";

const fastagSurveyAssignedSchema = new Schema(
  {
    startDate: {
      type: Date,
      required: true,
    },
    "Plaza Name": {
      type: String,
      required: true,
    },
    "Plaza Code": {
      type: String,
    },
    surveyorId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["Pending", "Completed"],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  },
);

const FastagSurveyAssigned = model(
  "FastagSurveyAssigned",
  fastagSurveyAssignedSchema,
);

export default FastagSurveyAssigned;
