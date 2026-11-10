import MediaAsset from "@/models/MediaAsset";
import {
  bucketForVisibility,
  deleteR2Object,
  r2ObjectExists,
} from "@/lib/r2Storage";

// One MongoDB is shared by every deployment and by local dev, and each may be
// configured with a different R2 bucket. R2 answers "deleted" even for a key
// it never had, so a delete from the wrong environment would succeed silently
// and mark a live school's logo DELETED while the file sits untouched in the
// real bucket. An asset is therefore only marked DELETED after this
// environment has confirmed the object is in its own bucket and removed it.
// Anything else is logged and left READY.
export async function deleteMediaAssets(query) {
  const assets = await MediaAsset.find({ ...query, status: "READY" }).lean();

  for (const asset of assets) {
    try {
      const bucket = bucketForVisibility(asset.visibility);
      if (asset.bucket && asset.bucket !== bucket) {
        console.warn(
          "Skipping media cleanup: asset lives in another bucket.",
          String(asset._id),
          asset.bucket
        );
        continue;
      }
      if (!(await r2ObjectExists(asset))) {
        console.warn(
          "Skipping media cleanup: object not found in this environment's bucket.",
          String(asset._id),
          bucket
        );
        continue;
      }
      await deleteR2Object(asset);
      await MediaAsset.updateOne(
        { _id: asset._id, status: "READY" },
        { $set: { status: "DELETED", deletedAt: new Date() } }
      );
    } catch (error) {
      console.error("Failed to delete unused media asset:", asset._id, error);
    }
  }
}
