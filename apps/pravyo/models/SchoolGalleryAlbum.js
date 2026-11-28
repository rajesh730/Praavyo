import mongoose from "mongoose";

/**
 * A photo album in the school's Gallery (dashboard → Gallery). PUBLIC albums
 * are served by the Website API (`/gallery`) to the school's own website;
 * DRAFT albums are the school's work in progress and are never served.
 *
 * Photos are MediaAssets with purpose GALLERY_IMAGE (public bucket). Removing
 * a photo or deleting an album removes those assets through
 * lib/mediaCleanup.js, which never touches any other purpose.
 */
const photoSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: "MediaAsset", required: true },
    url: { type: String, required: true },
    caption: { type: String, trim: true, maxlength: 200, default: "" },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: true }
);

const SchoolGalleryAlbumSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    // When the photos were taken (an event day). Optional.
    takenOn: { type: Date, default: null },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLIC"],
      default: "DRAFT",
    },
    publishedAt: { type: Date, default: null },
    photos: { type: [photoSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

SchoolGalleryAlbumSchema.index({ school: 1, status: 1, publishedAt: -1 });

export default mongoose.models.SchoolGalleryAlbum ||
  mongoose.model("SchoolGalleryAlbum", SchoolGalleryAlbumSchema);
