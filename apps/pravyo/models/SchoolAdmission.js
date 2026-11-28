import mongoose from "mongoose";

/**
 * A school's admission season (Settings → Admission). One row per school.
 *
 * While `isOpen` is true the school's public profile and its connected
 * website show the admission form, and applications arrive in Inquiries as
 * ADMISSION inquiries. Turning it off closes the season: the form stays,
 * marked "closed for this year — apply for next year", and applications are
 * taken for next year (SchoolInquiry admission.forNextYear). Applications
 * already received stay.
 *
 * Kept apart from SchoolConfig so config clean-ups never touch it.
 */
const SchoolAdmissionSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    isOpen: { type: Boolean, default: false },
    // Shown to families, e.g. "2083 BS". Free text: schools name years their own way.
    academicYear: { type: String, trim: true, maxlength: 40, default: "" },
    // Grades taking applications. Empty = every grade the school runs.
    grades: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    // Last date to apply, shown to families. Informational: the school closes
    // the season itself.
    deadline: { type: Date, default: null },
    // Instructions for families: documents to bring, fees, entrance test.
    note: { type: String, trim: true, maxlength: 1500, default: "" },
    openedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export default mongoose.models.SchoolAdmission ||
  mongoose.model("SchoolAdmission", SchoolAdmissionSchema);
