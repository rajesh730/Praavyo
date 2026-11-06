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
  },
  { _id: false }
);

/**
 * One school's registration for one training (see models/Training.js).
 *
 * `selection` records how the school chose (whole school, grades, chosen
 * people) so the form reopens the same way; `participants` is the resolved
 * list at the time of saving, and is who gets certificates.
 *
 * REGISTERED → COMPLETED when Praavyo marks the school's training done
 * (certificates issued); reopening deletes those certificates again.
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
    status: { type: String, enum: ["REGISTERED", "COMPLETED"], default: "REGISTERED" },
    // The day Praavyo trained at this school; printed on the certificates.
    trainingDate: { type: Date, default: null },
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
