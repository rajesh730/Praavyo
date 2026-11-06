import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import MediaAsset from "@/models/MediaAsset";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

/**
 * Saves the public profile's cover image the moment it is uploaded, like the
 * logo (../logo). It used to live only in the form until "Save" was pressed,
 * so a school that uploaded a cover and moved on never saw it on its page.
 *
 * The replaced image is deliberately NOT deleted: the full-profile form can
 * still hold the old URL in another tab, and an orphaned file is harmless
 * where a deleted one that is still referenced is not.
 */
function assetIdFromUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  const match = url.match(/^\/api\/media\/r2\/([a-f0-9]{24})$/i);
  return match?.[1] || "invalid";
}

export async function PATCH(request) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const bannerImageUrl = String(body.bannerImageUrl || "").trim();
    const assetId = assetIdFromUrl(bannerImageUrl);
    if (assetId === "invalid" || (assetId && !mongoose.Types.ObjectId.isValid(assetId))) {
      return validationError("Choose a cover image uploaded through this form.");
    }

    await connectDB();
    if (assetId) {
      const ownsAsset = await MediaAsset.exists({
        _id: assetId,
        school: session.user.id,
        purpose: "SCHOOL_COVER",
        visibility: "PUBLIC",
        status: "READY",
      });
      if (!ownsAsset) {
        return validationError("This cover image does not belong to your school.");
      }
    }

    const profile = await SchoolShowcaseProfile.findOneAndUpdate(
      { school: session.user.id },
      { $set: { bannerImageUrl } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    revalidatePath(`/schools/${session.user.id}`);

    return successResponse(200, bannerImageUrl ? "Cover image updated" : "Cover image removed", {
      bannerImageUrl: profile.bannerImageUrl || "",
    });
  } catch (updateError) {
    console.error("School cover update failed:", updateError);
    return errorResponse(500, "Failed to update the cover image.");
  }
}
