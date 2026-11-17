import mongoose from "mongoose";
import { schoolIemisNumber, studentIemisNumber } from "@pravyo/db/iemis";

// A transfer record for moving an existing student between schools.
// Flow: a parent (guardian) requests release -> current school approves and
// issues a transfer code -> the parent chooses the destination -> destination
// school admits. (Older requests were made by the student.)
// The SAME Student document is reused so achievements/writings/results stay
// linked to the person.

const StudentTransferSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    platformStudentId: {
      type: String,
      default: "",
      trim: true,
    },
    fromSchool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    toSchool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requestedByStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    requestedByParent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "PENDING_RELEASE",
        "RELEASED",
        "PENDING_ADMISSION",
        "COMPLETED",
        "REJECTED",
        "CANCELLED",
      ],
      default: "PENDING_RELEASE",
    },
    transferCode: {
      type: String,
      default: "",
      trim: true,
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    targetSelectedAt: {
      type: Date,
      default: null,
    },
    // Where the new school will place the student.
    toGrade: {
      type: String,
      default: "",
      trim: true,
    },
    toRollNumber: {
      type: String,
      default: "",
      trim: true,
    },
    toAcademicYear: {
      type: String,
      default: "",
      trim: true,
    },
    toAcademicYearStart: {
      type: Number,
      default: null,
    },
    // Snapshots for display without extra populates / after the student moves.
    studentNameSnapshot: {
      type: String,
      default: "",
      trim: true,
    },
    fromSchoolNameSnapshot: {
      type: String,
      default: "",
      trim: true,
    },
    // Government IEMIS identity at the time of the move: which student, from
    // which school, to which school. Filled by the pre-save hook below and
    // never rewritten afterwards (except the destination, while the family is
    // still choosing it), so the record stays a faithful history even if a
    // number is corrected later.
    studentIemisNumber: { type: String, default: "", trim: true, uppercase: true },
    // A move to a school that is NOT on Praavyo (toSchool stays null). The
    // school records where the student went; nobody on the other side admits
    // them. Created COMPLETED by lib/studentTransferOut.js.
    externalSchool: {
      name: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
    },
    certificateNumber: { type: String, default: "", trim: true },
    fromSchoolIemisNumber: { type: String, default: "", trim: true, uppercase: true },
    toSchoolIemisNumber: { type: String, default: "", trim: true, uppercase: true },
    reason: {
      type: String,
      default: "",
      trim: true,
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
    decisionReason: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

StudentTransferSchema.pre("save", async function fillIemisSnapshots() {
  const session = this.$session();
  if (this.student && !this.studentIemisNumber) {
    this.studentIemisNumber = await studentIemisNumber(this.student, { session });
  }
  if (this.fromSchool && !this.fromSchoolIemisNumber) {
    this.fromSchoolIemisNumber = await schoolIemisNumber(this.fromSchool, { session });
  }
  // The destination changes while the family chooses (and after a decline);
  // once the transfer completes it no longer changes. A move to a school
  // outside Praavyo has no toSchool and keeps the IEMIS number it was given.
  if (this.toSchool && (this.isNew || this.isModified("toSchool"))) {
    this.toSchoolIemisNumber = await schoolIemisNumber(this.toSchool, { session });
  } else if (!this.isNew && this.isModified("toSchool")) {
    this.toSchoolIemisNumber = "";
  }
});

// Only one open (PENDING) transfer per student at a time.
StudentTransferSchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: ["PENDING", "PENDING_RELEASE", "RELEASED", "PENDING_ADMISSION"],
      },
    },
  }
);
StudentTransferSchema.index({ toSchool: 1, status: 1, createdAt: -1 });
StudentTransferSchema.index({ fromSchool: 1, status: 1, createdAt: -1 });

const existingStudentTransferModel = mongoose.models.StudentTransfer;

if (
  existingStudentTransferModel &&
  (!existingStudentTransferModel.schema.path("transferCode") ||
    !existingStudentTransferModel.schema.path("studentIemisNumber") ||
    !existingStudentTransferModel.schema.path("externalSchool.name") ||
    !existingStudentTransferModel.schema
      .path("status")
      ?.enumValues?.includes("PENDING_RELEASE"))
) {
  delete mongoose.models.StudentTransfer;
}

const StudentTransfer =
  mongoose.models.StudentTransfer ||
  mongoose.model("StudentTransfer", StudentTransferSchema);

export default StudentTransfer;
