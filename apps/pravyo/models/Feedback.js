import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "submitterModel",
      required: true,
      index: true,
    },
    submitterModel: {
      type: String,
      enum: ["User", "Student", "Parent", "Teacher"],
      required: true,
    },
    submitterRole: {
      type: String,
      enum: ["SCHOOL_ADMIN", "STUDENT", "PARENT", "TEACHER"],
      required: true,
      index: true,
    },
    submitterName: {
      type: String,
      default: "",
      trim: true,
    },
    submitterEmail: {
      type: String,
      default: "",
      trim: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Who reads it: PLATFORM = Praavyo (feedback from a school), SCHOOL = the
    // school (feedback from its students, parents and teachers).
    recipient: {
      type: String,
      enum: ["PLATFORM", "SCHOOL"],
      default: "PLATFORM",
      index: true,
    },
    // A parent's feedback is about one of their children.
    aboutStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    aboutStudentName: {
      type: String,
      default: "",
      trim: true,
    },
    // The student's grade (the student's own, or the parent's child's).
    grade: {
      type: String,
      default: "",
      trim: true,
    },
    schoolName: {
      type: String,
      default: "",
      trim: true,
    },
    type: {
      type: String,
      enum: ["GENERAL", "BUG", "SUGGESTION", "EXPERIENCE"],
      default: "GENERAL",
      index: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    status: {
      type: String,
      enum: ["NEW", "REVIEWED", "ARCHIVED"],
      default: "NEW",
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ school: 1, createdAt: -1 });

export default mongoose.models.Feedback ||
  mongoose.model("Feedback", feedbackSchema);
