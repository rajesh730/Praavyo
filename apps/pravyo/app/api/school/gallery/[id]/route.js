import mongoose from "mongoose";
import { defineRoute } from "@/lib/routeHandler";
import SchoolGalleryAlbum from "@/models/SchoolGalleryAlbum";
import MediaAsset from "@/models/MediaAsset";
import { deleteMediaAssets } from "@/lib/mediaCleanup";
import { parseAlbumInput, serializeAlbumForSchool } from "@/lib/schoolGallery";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

const notFound = () => errorResponse(404, "Album not found.");

/**
 * PATCH { title?, description?, takenOn?, status?, photos? } — edit an album.
 * `photos` is the full ordered list [{ asset, caption }]: new uploads are
 * added, missing ones are removed (and their files deleted), order and
 * captions follow the list. Only the school's own GALLERY_IMAGE uploads.
 */
export const PATCH = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to save the album" },
  async ({ request, params, session }) => {
    if (!mongoose.Types.ObjectId.isValid(params.id)) return notFound();
    const schoolId = session.user.id;
    const album = await SchoolGalleryAlbum.findOne({ _id: params.id, school: schoolId });
    if (!album) return notFound();

    const body = await request.json().catch(() => null);
    const { data, error } = parseAlbumInput(body, { partial: true });
    if (error) return validationError(error);

    let removedAssets = [];
    if (data.photos) {
      const existing = new Map(album.photos.map((photo) => [String(photo.asset), photo]));
      const newIds = data.photos.map((photo) => photo.asset).filter((id) => !existing.has(id));
      const assets = newIds.length
        ? await MediaAsset.find({
            _id: { $in: newIds },
            school: schoolId,
            purpose: "GALLERY_IMAGE",
            status: "READY",
          })
            .select("_id width height")
            .lean()
        : [];
      const uploaded = new Map(assets.map((asset) => [String(asset._id), asset]));
      if (uploaded.size !== newIds.length) {
        return validationError("A photo could not be found. Upload it again.");
      }

      album.photos = data.photos.map((photo) => {
        const kept = existing.get(photo.asset);
        if (kept) {
          return { _id: kept._id, asset: kept.asset, url: kept.url, width: kept.width, height: kept.height, caption: photo.caption };
        }
        const asset = uploaded.get(photo.asset);
        return {
          asset: asset._id,
          url: `/api/media/r2/${asset._id}`,
          width: asset.width || 0,
          height: asset.height || 0,
          caption: photo.caption,
        };
      });
      const keep = new Set(data.photos.map((photo) => photo.asset));
      removedAssets = [...existing.keys()].filter((id) => !keep.has(id));
      delete data.photos;
    }

    if (data.status === "PUBLIC" && album.status !== "PUBLIC") album.publishedAt = new Date();
    Object.assign(album, data);
    if (album.status === "PUBLIC" && album.photos.length === 0) {
      return validationError("Add at least one photo before making the album public.");
    }
    await album.save();

    if (removedAssets.length) {
      await deleteMediaAssets({ _id: { $in: removedAssets }, school: schoolId, purpose: "GALLERY_IMAGE" });
    }

    return successResponse(200, "Album saved", { album: serializeAlbumForSchool(album.toObject()) });
  }
);

/** DELETE — remove the album and its photos. */
export const DELETE = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to delete the album" },
  async ({ params, session }) => {
    if (!mongoose.Types.ObjectId.isValid(params.id)) return notFound();
    const schoolId = session.user.id;
    const album = await SchoolGalleryAlbum.findOneAndDelete({ _id: params.id, school: schoolId }).lean();
    if (!album) return notFound();

    const assetIds = (album.photos || []).map((photo) => photo.asset);
    if (assetIds.length) {
      await deleteMediaAssets({ _id: { $in: assetIds }, school: schoolId, purpose: "GALLERY_IMAGE" });
    }
    return successResponse(200, "Album deleted", {});
  }
);
