import mongoose from "mongoose";

const scorecardEntrySchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    maxScore: {
      type: Number,
      default: 10,
      min: 1,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    comment: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const AchievementSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    recipientType: {
      type: String,
      // TEACHER: a Praavyo training certificate for a teacher (`teacher` set,
      // `student` null). Only trainings issue these.
      enum: ["STUDENT", "TEAM", "TEACHER"],
      default: "STUDENT",
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },
    teamName: {
      type: String,
      default: "",
      trim: true,
    },
    captainStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    parentAchievement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Achievement",
      default: null,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    // Participation certificates from a performance program (no competition).
    // Set instead of `event`; see models/PerformanceProgram.js.
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PerformanceProgram",
      default: null,
    },
    // Participation certificates from a Praavyo training (no competition),
    // issued per school when that school's registration is completed.
    // See models/Training.js and models/TrainingRegistration.js.
    training: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Training",
      default: null,
    },
    trainingRegistration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrainingRegistration",
      default: null,
    },
    performanceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    performanceTitle: {
      type: String,
      default: "",
      trim: true,
    },
    performanceType: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Please provide an achievement title"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    level: {
      type: String,
      enum: ["SCHOOL", "INTER_SCHOOL", "PLATFORM"],
      default: "SCHOOL",
    },
    placement: {
      type: String,
      enum: [
        "PARTICIPANT",
        "MERIT",
        "FINALIST",
        "THIRD_PLACE",
        "RUNNER_UP",
        "WINNER",
        "SPECIAL_MENTION",
      ],
      default: "PARTICIPANT",
    },
    certificateRecipientName: {
      type: String,
      default: "",
      trim: true,
    },
    finalStatus: {
      type: String,
      default: "",
      trim: true,
    },
    highestRoundReached: {
      type: Number,
      default: 0,
      min: 0,
    },
    schoolSharedAt: {
      type: Date,
      default: null,
    },
    certificateUrl: {
      type: String,
      default: "",
      trim: true,
    },
    certificateCode: {
      type: String,
      default: "",
      trim: true,
    },
    certificateIssuedAt: {
      type: Date,
      default: null,
    },
    certificateState: {
      type: String,
      enum: ["CERTIFICATE_PREVIEW", "CERTIFICATE_ACTIVE"],
      default: "CERTIFICATE_PREVIEW",
    },
    scorecard: {
      type: [scorecardEntrySchema],
      default: [],
    },
    totalScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    scorePercentage: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    awardedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

AchievementSchema.pre("validate", function () {
  this.certificateState = this.certificateIssuedAt
    ? "CERTIFICATE_ACTIVE"
    : "CERTIFICATE_PREVIEW";
});

AchievementSchema.index({ school: 1, awardedAt: -1 });
AchievementSchema.index({ student: 1, awardedAt: -1 });
AchievementSchema.index({ event: 1, placement: 1, awardedAt: -1 });
AchievementSchema.index({ program: 1, student: 1 });
AchievementSchema.index({ trainingRegistration: 1 });
AchievementSchema.index({ teacher: 1, awardedAt: -1 });
AchievementSchema.index({ isPublic: 1, awardedAt: -1 });
AchievementSchema.index({ school: 1, isPublic: 1, awardedAt: -1 });
AchievementSchema.index(
  { certificateCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      certificateCode: { $type: "string", $gt: "" },
    },
  }
);

const existingAchievementModel = mongoose.models.Achievement;

if (
  existingAchievementModel &&
  (!existingAchievementModel.schema.path("recipientType") ||
    !existingAchievementModel.schema.path("parentAchievement") ||
    !existingAchievementModel.schema.path("program") ||
    !existingAchievementModel.schema.path("training"))
) {
  delete mongoose.models.Achievement;
}

const Achievement =
  mongoose.models.Achievement || mongoose.model("Achievement", AchievementSchema);

export default Achievement;
