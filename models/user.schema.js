import mongoose from "mongoose";

const CompanyType = {
  PRIVATE_LIMITED: "Private Limited",
  PUBLIC: "Public",
  PARTNERSHIP: "Partnership",
  PROPRIETORSHIP: "Proprietorship",
  LLP: "Limited Liability Partnership",
};

const Status = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

const UserType = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  CONTRACTOR: "Contractor",
  TESTER: "Tester",
  SURVEYOR: "Surveyor",
};

const userSchema = new mongoose.Schema(
  {
    employeeCode: { type: String },
    name: { type: String },
    designation: { type: String },
    email: { type: String, unique: true },
    mobNum: { type: String, unique: true },
    hashedPassword: { type: String },
    profileImage: { type: String },
    refreshToken: [{ type: String }],

    companyName: { type: String },
    companyType: { type: String, enum: CompanyType },
    companyGstNo: { type: String },
    companyGstBase64: { type: String },
    companyPanNo: { type: String },
    companyPanBase64: { type: String },

    address: {
      district: {
        type: String,
      },
      state: {
        type: String,
      },
      pincode: {
        type: String,
      },
    },

    status: {
      type: String,
      enum: Status,
      default: Status.ACTIVE,
    },
    // isAdmin: { type: Boolean, default: false },
    userType: { type: String, enum: UserType },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

export default User;
