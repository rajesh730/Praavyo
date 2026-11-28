import mongoose from "mongoose";

/**
 * One run of "Promote year" for a school, kept so the school can undo it
 * (Settings → Academic Setup → "Undo last promotion"). Holds each student's
 * state from just before the promotion changed them, and the state of the two
 * academic years involved. See lib/promotionUndo.js.
 */
const studentSnapshotSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    name: { type: String, default: "" },
    outcome: { type: String, enum: ["promoted", "retained", "graduated"], required: true },
    // The fields the promotion changes, exactly as they were before it.
    before: { type: mongoose.Schema.Types.Mixed, required: true },
    // Fingerprint of the state the promotion left (lib/promotionUndo.js).
    afterFingerprint: { type: String, required: true },
  },
  { _id: false }
);

const PromotionRunSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fromYear: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", required: true },
      year: { type: String, default: "" },
      summaryBefore: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    toYear: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicYear", default: null },
      year: { type: String, default: "" },
      yearStart: { type: Number, default: null },
      // True when the promotion created the new year (undo removes it);
      // false when it already existed (undo closes it again).
      created: { type: Boolean, default: false },
    },
    students: { type: [studentSnapshotSchema], default: [] },
    summary: {
      promoted: { type: Number, default: 0 },
      retained: { type: Number, default: 0 },
      graduated: { type: Number, default: 0 },
    },
    status: { type: String, enum: ["COMPLETED", "UNDONE"], default: "COMPLETED" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    undoneAt: { type: Date, default: null },
    undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    undoSkipped: { type: [{ student: mongoose.Schema.Types.ObjectId, name: String, reason: String }], default: [] },
  },
  { timestamps: true }
);

PromotionRunSchema.index({ school: 1, createdAt: -1 });

export default mongoose.models.PromotionRun || mongoose.model("PromotionRun", PromotionRunSchema);
