import mongoose from "mongoose";

/**
 * A question sent to a school from its public profile (/schools/[id]) by a
 * visitor who is not signed in — a family considering admission, a partner,
 * anyone. Only that school reads it, in its dashboard under Inquiries.
 *
 * The visitor's email and phone are personal data: they are shown to the
 * school only, never on any public page, and never returned by a public API.
 */
const schoolInquirySchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
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

export default mongoose.models.SchoolInquiry ||
  mongoose.model("SchoolInquiry", schoolInquirySchema);
