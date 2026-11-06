import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    // Exactly one of these is set, matching the training's audience.
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
    // Snapshotted when registered, so the list and certificates keep the name
    // even if the record changes later.
    name: { type: String, required: true, trim: true },
    grade: { type: String, default: "", trim: true },
    section: { type: String, default: "", trim: true },
    // Marked by the school after the training. Null = not marked yet (and on
    // registrations completed before attendance existed, where it means present).
    attendance: { type: String, enum: ["PRESENT", "ABSENT", null], default: null },
  },
  { _id: false }
);

/**
 * One school's registration for one training (see models/Training.js).
 *
 * `selection` records how the school chose; `selection.grades` are the grades
 * it took whole (in every mode), so Praavyo reads "Grade 8 (whole) + 5 from
 * Grade 9". `participants` is the resolved list.
 *
 * REGISTERED → the school marks Present/Absent after the training and sends it
 * → SUBMITTED → Praavyo issues certificates to the present ones → COMPLETED.
 * Praavyo can send attendance back (SUBMITTED → REGISTERED, with a reason) or
 * undo a completion (COMPLETED → SUBMITTED, certificates withdrawn).
 */
const TrainingRegistrationSchema = new mongoose.Schema(
  {
    training: { type: mongoose.Schema.Types.ObjectId, ref: "Training", required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    selection: {
      mode: { type: String, enum: ["ALL", "GRADES", "CHOSEN"], default: "CHOSEN" },
      grades: { type: [String], default: [] },
    },
    participants: { type: [participantSchema], default: [] },
    status: { type: String, enum: ["REGISTERED", "SUBMITTED", "COMPLETED"], default: "REGISTERED" },
    // The day Praavyo trained at this school — entered by the school with the
    // attendance, correctable by Praavyo; printed on the certificates.
    trainingDate: { type: Date, default: null },
    attendanceSubmittedAt: { type: Date, default: null },
    attendanceSubmittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Set when Praavyo sends the attendance back; cleared when re-sent.
    returnedAt: { type: Date, default: null },
    returnReason: { type: String, default: "", trim: true, maxlength: 500 },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TrainingRegistrationSchema.index({ training: 1, school: 1 }, { unique: true });
TrainingRegistrationSchema.index({ school: 1, createdAt: -1 });

export default mongoose.models.TrainingRegistration ||
  mongoose.model("TrainingRegistration", TrainingRegistrationSchema);
