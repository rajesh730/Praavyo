import mongoose from "mongoose";

const SCHOOL_STORY_MAX_LENGTH = 2000;

const SchoolShowcaseProfileSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    tagline: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    summary: {
      type: String,
      default: "",
      trim: true,
      maxlength: SCHOOL_STORY_MAX_LENGTH,
    },
    // This used to be called coverImageUrl. A logo is not showcase copy: it is
    // school identity used on reports, certificates and public pages, so it
    // has its own field and write path. Keep the old field during the rolling
    // migration so schools do not lose logos uploaded before this change.
    logoUrl: {
      type: String,
      default: "",
      trim: true,
    },
    coverImageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    bannerImageUrl: {
      type: String,
      default: "",
      trim: true,
    },
    websiteUrl: {
      type: String,
      default: "",
      trim: true,
    },
    motto: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    contactEmail: {
      type: String,
      default: "",
      trim: true,
    },
    contactPhone: {
      type: String,
      default: "",
      trim: true,
    },
    socialLinks: {
      facebook: { type: String, default: "", trim: true },
      instagram: { type: String, default: "", trim: true },
      linkedin: { type: String, default: "", trim: true },
      tiktok: { type: String, default: "", trim: true },
      youtube: { type: String, default: "", trim: true },
      twitter: { type: String, default: "", trim: true },
    },
    visibility: {
      type: String,
      enum: ["PRIVATE", "PUBLIC"],
      default: "PRIVATE",
    },
    highlightMetrics: {
      eventsHosted: {
        type: Number,
        default: 0,
      },
      eventsParticipated: {
        type: Number,
        default: 0,
      },
      awardsCount: {
        type: Number,
        default: 0,
      },
      studentParticipationRate: {
        type: Number,
        default: 0,
      },
    },
    featuredEvents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
      },
    ],
    publicHighlights: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

SchoolShowcaseProfileSchema.index({ school: 1, visibility: 1 });

export default mongoose.models.SchoolShowcaseProfile ||
  mongoose.model("SchoolShowcaseProfile", SchoolShowcaseProfileSchema);
