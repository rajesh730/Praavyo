import mongoose from "mongoose";

const TeacherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide a name"],
  },
  email: {
    type: String,
    required: [true, "Please provide an email"],
    unique: true,
  },
  // Created and managed by the school. Older teacher records may not yet have
  // one, so this stays optional while email login remains fully supported.
  username: {
    type: String,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 40,
    sparse: true,
  },
  phone: {
    type: String,
  },
  qualification: {
    type: String,
  },
  gender: {
    type: String,
    enum: ["MALE", "FEMALE", "OTHER"],
  },
  address: {
    type: String,
  },
  dateOfJoining: {
    type: Date,
  },
  designation: {
    type: String,
  },
  experience: {
    type: Number,
  },
  bloodGroup: {
    type: String,
    enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
  },
  password: {
    type: String, // Hashed password for authentication
  },
  // Bumped to invalidate every printed login card (see @pravyo/auth/teacherCardToken).
  cardVersion: {
    type: Number,
    default: 0,
  },
  subject: {
    type: String,
    required: [true, "Please provide a focus area"],
  },
  roles: {
    type: [String],
    default: ["MENTOR"],
  },
  employmentType: {
    type: String,
    enum: ["FULL_TIME", "PART_TIME", "CONTRACT"],
    default: "FULL_TIME",
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE"],
    default: "ACTIVE",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

TeacherSchema.index({ school: 1, isDeleted: 1, createdAt: -1 });
TeacherSchema.index({ school: 1, isDeleted: 1, status: 1, createdAt: -1 });
TeacherSchema.index({ school: 1, isDeleted: 1, email: 1 });
TeacherSchema.index({ username: 1 }, { unique: true, sparse: true });
TeacherSchema.index({ school: 1, isDeleted: 1, subject: 1, createdAt: -1 });

export default mongoose.models.Teacher ||
  mongoose.model("Teacher", TeacherSchema);
