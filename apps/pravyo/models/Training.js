import mongoose from "mongoose";

/**
 * A training Praavyo runs at schools — "AI Development Course", "Canva 5-Day
 * Training" — as opposed to a competition. No rounds, scores or results.
 *
 *   Praavyo creates it (DRAFT) → publishes it (PUBLISHED: schools register)
 *   → each school registers its participants (TrainingRegistration)
 *   → Praavyo trains at that school, in person, and marks that school's
 *     registration completed → every registered participant gets a
 *     participation certificate carrying the Praavyo and school logos.
 *
 * A training is for students OR for teachers, never both: the school then
 * registers students (whole school, some grades or chosen students) or
 * teachers. Completion is per school, because Praavyo visits each school.
 */
const TrainingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", trim: true, maxlength: 3000 },
    audience: { type: String, enum: ["STUDENTS", "TEACHERS"], required: true },
    // Student trainings only: the grades a school may register. Empty = all.
    grades: { type: [String], default: [] },
    // Free text printed on the certificate, e.g. "5 days" or "3 hours".
    duration: { type: String, default: "", trim: true, maxlength: 60 },
    // Optional last day schools can register or change their list.
    registrationDeadline: { type: Date, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "CLOSED"],
      default: "DRAFT",
    },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

TrainingSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Training || mongoose.model("Training", TrainingSchema);
