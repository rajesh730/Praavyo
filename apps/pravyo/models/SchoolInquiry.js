import mongoose from "mongoose";

/**
 * A question or an admission application sent to a school by someone who is
 * not signed in: a family considering admission, a partner, anyone. Only that
 * school reads it, in its dashboard under Inquiries.
 *
 * `source` says where it was sent from:
 *   PRAAVYO — the school's public profile on Praavyo (/schools/[id]);
 *   WEBSITE — the school's own website, through the Website API.
 * `type` says what it is:
 *   GENERAL   — a question (name, email, phone, subject, message);
 *   ADMISSION — an admission application while the school's admission season
 *               is open; the student's details sit in `admission`. For these,
 *               `name` is the guardian's name and email is optional.
 * Rows written before these fields existed are PRAAVYO + GENERAL.
 *
 * The visitor's email and phone are personal data: they are shown to the
 * school only, never on any public page, and never returned by a public API.
 */
const admissionSchema = new mongoose.Schema(
  {
    studentName: { type: String, trim: true, maxlength: 80, default: "" },
    dateOfBirth: { type: String, trim: true, maxlength: 30, default: "" },
    gender: { type: String, trim: true, maxlength: 20, default: "" },
    grade: { type: String, trim: true, maxlength: 40, default: "" },
    previousSchool: { type: String, trim: true, maxlength: 150, default: "" },
    guardianRelation: { type: String, trim: true, maxlength: 40, default: "" },
    address: { type: String, trim: true, maxlength: 200, default: "" },
    // The admission season's academic year when the application was sent.
    academicYear: { type: String, trim: true, maxlength: 40, default: "" },
  },
  { _id: false }
);

const schoolInquirySchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["GENERAL", "ADMISSION"],
      default: "GENERAL",
    },
    source: {
      type: String,
      enum: ["PRAAVYO", "WEBSITE"],
      default: "PRAAVYO",
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Required for general inquiries (checked by lib/schoolInquiries.js);
    // optional on admission applications, where the phone is enough.
    email: { type: String, trim: true, lowercase: true, maxlength: 160, default: "" },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    admission: { type: admissionSchema, default: undefined },
    // NEW until the school opens it; ARCHIVED hides it from the inbox.
    status: {
      type: String,
      enum: ["NEW", "READ", "ARCHIVED"],
      default: "NEW",
    },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

schoolInquirySchema.index({ school: 1, status: 1, createdAt: -1 });
schoolInquirySchema.index({ school: 1, source: 1, type: 1, createdAt: -1 });

export default mongoose.models.SchoolInquiry ||
  mongoose.model("SchoolInquiry", schoolInquirySchema);
