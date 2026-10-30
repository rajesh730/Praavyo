import mongoose from "mongoose";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import MediaAsset from "@/models/MediaAsset";
import SchoolConfig from "@/models/SchoolConfig";
import { deleteMediaAssets } from "@/lib/mediaCleanup";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

function assetIdFromUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  const match = url.match(/^\/api\/media\/r2\/([a-f0-9]{24})$/i);
  return match?.[1] || "invalid";
}

/**
 * The optional image on the right of the report card header. Saved on its
 * own, as soon as it is uploaded or removed, like the school logo.
 */
export async function PATCH(request) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;

    const body = await request.json();
    const reportCardImageUrl = String(body.reportCardImageUrl || "").trim();
    const assetId = assetIdFromUrl(reportCardImageUrl);
    if (assetId === "invalid" || (assetId && !mongoose.Types.ObjectId.isValid(assetId))) {
      return validationError("Choose an image uploaded through this form.");
    }

    await connectDB();
    const existing = await SchoolConfig.findOne({ school: session.user.id })
      .select("reportCardImageUrl")
      .lean();
    if (assetId) {
      const ownsAsset = await MediaAsset.exists({
        _id: assetId,
        school: session.user.id,
        purpose: "REPORT_CARD_IMAGE",
        visibility: "PUBLIC",
        status: "READY",
      });
      if (!ownsAsset) {
        return validationError("This image does not belong to your school.");
      }
    }

    const config = await SchoolConfig.findOneAndUpdate(
      { school: session.user.id },
      { $set: { reportCardImageUrl } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const previousAssetId = assetIdFromUrl(existing?.reportCardImageUrl);
    if (previousAssetId && previousAssetId !== "invalid" && previousAssetId !== assetId) {
      await deleteMediaAssets({
        _id: previousAssetId,
        school: session.user.id,
        purpose: "REPORT_CARD_IMAGE",
      });
    }

    return successResponse(200, reportCardImageUrl ? "Report card image updated" : "Report card image removed", {
      reportCardImageUrl: config.reportCardImageUrl || "",
    });
  } catch (updateError) {
    console.error("Report card image update failed:", updateError);
    return errorResponse(500, "Failed to update the report card image.");
  }
}
