import mongoose from "mongoose";

const MagazineIssueSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // true once the school renamed it; otherwise the title is the automatic
    // "<Month> Magazine <n>".
    titleEdited: {
      type: Boolean,
      default: false,
    },
    weekStart: {
      type: Date,
      required: true,
      index: true,
    },
    weekEnd: {
      type: Date,
      required: true,
    },
    weekNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 53,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
    },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED"],
      default: "PUBLISHED",
      index: true,
    },
    // A draft can be prepared privately. Only an explicitly opened draft is
    // offered to students and accepts new magazine submissions.
    acceptingSubmissions: {
      type: Boolean,
      default: false,
      index: true,
    },
    writingOpenedAt: {
      type: Date,
      default: null,
    },
    writingClosedAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    showOnHome: {
      type: Boolean,
      default: false,
      index: true,
    },
    homeShownAt: {
      type: Date,
      default: null,
    },
    // The school notices this magazine posted, so each is shown only while it
    // is true: "New magazine… writing is closed" until writing opens, and
    // "Writing is open" only while writing is open (re-shown, not re-sent,
    // when the school opens writing again).
    createdNotice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notice",
      default: null,
    },
    writingNotice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notice",
      default: null,
    },
    // "New magazine is out", sent once on first publish; hidden while the
    // issue is unpublished and shown again (not re-sent) on republish.
    publishedNotice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Notice",
      default: null,
    },
    articles: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SchoolMagazineArticle",
      },
    ],
  },
  { timestamps: true }
);

MagazineIssueSchema.index({ school: 1, year: -1, month: -1, weekNumber: -1 });
MagazineIssueSchema.index({ school: 1, status: 1, acceptingSubmissions: 1, weekStart: -1 });
MagazineIssueSchema.index({
  status: 1,
  showOnHome: 1,
  homeShownAt: -1,
  publishedAt: -1,
  weekStart: -1,
  createdAt: -1,
});

export default mongoose.models.MagazineIssue ||
  mongoose.model("MagazineIssue", MagazineIssueSchema);
