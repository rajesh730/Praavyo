import mongoose from "mongoose";
import { ALL_WRITING_CATEGORIES } from "../lib/writingCategories.js";

const MAX_WRITING_CONTENT_LENGTH = 50000;

const SchoolMagazineArticleSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authorStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    // Authoring-era snapshot: where + when this was written, frozen at creation.
    // `school` (the ref above) remains the owning/origin school and never moves on
    // transfer; these fields just let every surface label the piece as history
    // ("written at X · Grade 9 · 2026") instead of a stale current affiliation.
    // See docs/ACADEMIC_YEAR_AND_PORTFOLIO.md.
    authorSchoolNameSnapshot: {
      type: String,
      default: "",
      trim: true,
    },
    authorGrade: {
      type: String,
      default: "",
      trim: true,
    },
    authorAcademicYear: {
      type: String,
      default: "",
      trim: true,
    },
    authorAcademicYearStart: {
      type: Number,
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_WRITING_CONTENT_LENGTH,
    },
    images: {
      type: [
        {
          asset: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MediaAsset",
            required: true,
          },
          url: { type: String, required: true },
          caption: { type: String, default: "", maxlength: 240 },
          altText: { type: String, default: "", maxlength: 240 },
          order: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    coverImage: {
      asset: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MediaAsset",
        default: null,
      },
      url: { type: String, default: "" },
      altText: { type: String, default: "", maxlength: 240 },
    },
    tags: {
      type: [{ type: String, trim: true, maxlength: 40 }],
      default: [],
    },
    category: {
      type: String,
      enum: ALL_WRITING_CATEGORIES,
      default: "BLOG_ARTICLE",
    },
    // Where the student sent it: FREE_WRITE = the school wall, MAGAZINE =
    // the school magazine. Only MAGAZINE writings can go into an issue, and
    // they stay off the school wall.
    submissionSource: {
      type: String,
      enum: ["FREE_WRITE", "MAGAZINE"],
      default: "FREE_WRITE",
      index: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
      default: "DRAFT",
      index: true,
    },
    reviewNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    // When the school first opened/read this post on the wall. Drives the
    // per-post "unread" marker (null = not yet read by the school).
    schoolReadAt: {
      type: Date,
      default: null,
    },
    firstSubmittedAt: {
      type: Date,
      default: null,
    },
    lastResubmittedAt: {
      type: Date,
      default: null,
    },
    revisionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    publicationScope: {
      type: String,
      enum: ["SCHOOL_ONLY", "REGISTERED_SCHOOLS"],
      default: "SCHOOL_ONLY",
    },
    isMagazinePublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Set when the school corrects the writing (title, text, type). The one
    // document is what the wall, magazine, home page and the student's
    // portfolio all read, so an edit shows everywhere at once.
    schoolEditedAt: {
      type: Date,
      default: null,
    },
    // The magazine the student wrote this for (a DRAFT issue, i.e. one still
    // open for writing). The school then chooses whether to include it.
    requestedIssue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MagazineIssue",
      default: null,
      index: true,
    },
    magazineIssue: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MagazineIssue",
      default: null,
      index: true,
    },
    magazineIssueAssignedAt: {
      type: Date,
      default: null,
    },
    magazinePublishedAt: {
      type: Date,
      default: null,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    showOnSchoolWall: {
      type: Boolean,
      default: true,
      index: true,
    },
    isGlobalWallPublished: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    // "SCHOOL" when the school deleted it (deletedBy then stays null).
    deletedByRole: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

SchoolMagazineArticleSchema.index({
  school: 1,
  status: 1,
  isDeleted: 1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  authorStudent: 1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  school: 1,
  isDeleted: 1,
  status: 1,
  submittedAt: -1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  school: 1,
  isDeleted: 1,
  showOnSchoolWall: 1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  isDeleted: 1,
  isGlobalWallPublished: 1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  school: 1,
  isDeleted: 1,
  isPublished: 1,
  publishedAt: -1,
});
SchoolMagazineArticleSchema.index({
  status: 1,
  isPublished: 1,
  isDeleted: 1,
  publishedAt: -1,
  updatedAt: -1,
});
SchoolMagazineArticleSchema.index({
  magazineIssue: 1,
  isMagazinePublished: 1,
  isDeleted: 1,
  magazinePublishedAt: 1,
  updatedAt: 1,
});
SchoolMagazineArticleSchema.index({
  challenge: 1,
  isDeleted: 1,
  status: 1,
  createdAt: -1,
});

export default mongoose.models.SchoolMagazineArticle ||
  mongoose.model("SchoolMagazineArticle", SchoolMagazineArticleSchema);
