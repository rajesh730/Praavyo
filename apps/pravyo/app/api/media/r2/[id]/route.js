import mongoose from "mongoose";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import { getR2Object } from "@/lib/r2Storage";
import MediaAsset from "@/models/MediaAsset";
import ParentStudentLink from "@/models/ParentStudentLink";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import Student from "@/models/Student";
import { buildStudentLookupForSession } from "@/lib/studentIdentity";

function isMissingObjectError(error) {
  return (
    ["NoSuchKey", "NotFound", "NoSuchObject"].includes(
      String(error?.name || error?.Code || error?.code || "")
    ) || Number(error?.$metadata?.httpStatusCode || 0) === 404
  );
}

async function canReadPrivate(session, asset) {
  if (!session?.user) return false;
  if (session.user.role === "SUPER_ADMIN") return true;
  if (session.user.role === "SCHOOL_ADMIN") {
    return String(asset.school) === String(session.user.id);
  }
  if (session.user.role === "STUDENT") {
    const student = await Student.findOne(buildStudentLookupForSession(session))
      .select("_id school")
      .lean();
    return Boolean(
      student &&
        (String(asset.ownerStudent) === String(student._id) ||
          String(asset.school) === String(student.school))
    );
  }
  if (session.user.role === "PARENT" && asset.ownerStudent) {
    return Boolean(
      await ParentStudentLink.exists({
        parent: session.user.id,
        student: asset.ownerStudent,
        status: "ACTIVE",
        canViewPortfolio: true,
      })
    );
  }
  return false;
}

export async function GET(_request, { params }) {
  let asset = null;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return new Response("Not found", { status: 404 });
    }
    await connectDB();
    asset = await MediaAsset.findOne({ _id: id, status: "READY" }).lean();
    if (!asset) return new Response("Not found", { status: 404 });

    const publiclyPublished = Boolean(
      asset.writing &&
        (await SchoolMagazineArticle.exists({
          _id: asset.writing,
          isDeleted: { $ne: true },
          $or: [
            { isMagazinePublished: true },
            { isPublished: true },
            { isGlobalWallPublished: true },
          ],
        }))
    );
    const permanentlyPublic = asset.visibility === "PUBLIC";
    const publicAccess = permanentlyPublic || publiclyPublished;

    if (!publicAccess) {
      const { session, error } = await requireApiSession();
      if (error) return error;
      if (!(await canReadPrivate(session, asset))) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const object = await getR2Object(asset);
    return new Response(object.Body.transformToWebStream(), {
      headers: {
        "Content-Type": object.ContentType || asset.mimeType,
        "Content-Length": String(object.ContentLength || asset.sizeBytes),
        "Cache-Control":
          permanentlyPublic
            // Storage keys are UUIDs and never overwritten. A new upload has
            // a new URL, so public media can be cached at the browser and CDN
            // without serving a replacement image under an old URL.
            ? "public, max-age=31536000, immutable"
            // A writing asset can be public only because its article is
            // published. Its access must be rechecked after an unpublish.
            : publicAccess
              ? "public, max-age=0, must-revalidate"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (readError) {
    // A missing object is only reported, never "cleaned up". This database is
    // shared by every deployment and by local dev, and each may point at a
    // different bucket (or briefly fail). Marking the asset DELETED and
    // blanking the logo here once wiped live schools' logos and report-card
    // images just because someone opened them from the wrong environment.
    if (asset && isMissingObjectError(readError)) {
      console.warn("R2 object missing for media asset:", String(asset._id), asset.purpose);
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("R2 media read failed:", readError);
    return new Response("Media unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
