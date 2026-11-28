import { defineRoute } from "@/lib/routeHandler";
import SchoolGalleryAlbum from "@/models/SchoolGalleryAlbum";
import { GALLERY_LIMITS, parseAlbumInput, serializeAlbumForSchool } from "@/lib/schoolGallery";
import { errorResponse, successResponse, validationError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/** GET — the school's Gallery: every album, drafts included, newest first. */
export const GET = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to load the gallery" },
  async ({ session }) => {
    const rows = await SchoolGalleryAlbum.find({ school: session.user.id })
      .sort({ createdAt: -1 })
      .limit(GALLERY_LIMITS.albumsPerSchool)
      .lean();
    return successResponse(200, "Gallery loaded", { albums: rows.map(serializeAlbumForSchool) });
  }
);

/** POST { title, description?, takenOn? } — start a new (draft) album. */
export const POST = defineRoute(
  { roles: ["SCHOOL_ADMIN"], errorMessage: "Failed to create the album" },
  async ({ request, session }) => {
    const body = await request.json().catch(() => null);
    const { data, error } = parseAlbumInput({ ...body, status: "DRAFT", photos: undefined });
    if (error) return validationError(error);

    const count = await SchoolGalleryAlbum.countDocuments({ school: session.user.id });
    if (count >= GALLERY_LIMITS.albumsPerSchool) {
      return errorResponse(409, "Your gallery is full. Delete an old album first.", "GALLERY_FULL");
    }

    const album = await SchoolGalleryAlbum.create({
      ...data,
      school: session.user.id,
      createdBy: session.user.id,
    });
    return successResponse(201, "Album created", { album: serializeAlbumForSchool(album.toObject()) });
  }
);
