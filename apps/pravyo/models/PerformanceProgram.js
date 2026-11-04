import mongoose from "mongoose";

/**
 * A school program with performances and no competition: Dashain Program,
 * Tihar Program, Annual Day. There are no rounds, scores or winners.
 *
 *   Program (Tihar Program, date)
 *     └─ Performance (Group dance on Deusi song · GROUP)
 *          └─ Performer (student, REGISTERED → PERFORMED / NOT_PERFORMED)
 *
 * Students, assigned teachers and the school add performers while the list is
 * open. The school locks the list once it is final. On the day the school or
 * an assigned teacher ticks who performed. When the school publishes, every
 * PERFORMED student gets a participation Achievement (certificate) for that
 * performance. Unpublishing deletes those certificates again.
 */
const performerSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    status: {
      type: String,
      enum: ["REGISTERED", "PERFORMED", "NOT_PERFORMED"],
      default: "REGISTERED",
    },
    addedByRole: { type: String, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    addedAt: { type: Date, default: Date.now },
    markedAt: { type: Date, default: null },
  },
  { _id: false }
);

const performanceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  performanceType: { type: String, enum: ["SOLO", "GROUP"], default: "SOLO" },
  performers: { type: [performerSchema], default: [] },
});

const PerformanceProgramSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    academicYear: { type: String, default: "" },
    academicYearStart: { type: Number, default: null },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    venue: { type: String, default: "", trim: true, maxlength: 160 },
    date: { type: Date, required: true },
    assignedTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],
    performances: { type: [performanceSchema], default: [] },
    participantsLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    certificatesPublishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

PerformanceProgramSchema.index({ school: 1, date: -1 });
PerformanceProgramSchema.index({ school: 1, academicYearStart: -1 });
PerformanceProgramSchema.index({ assignedTeachers: 1 });
PerformanceProgramSchema.index({ "performances.performers.student": 1 });

const PerformanceProgram =
  mongoose.models.PerformanceProgram ||
  mongoose.model("PerformanceProgram", PerformanceProgramSchema);

export default PerformanceProgram;
