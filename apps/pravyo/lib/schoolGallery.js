/**
 * School Gallery albums: one definition of a valid album edit, and the shapes
 * the dashboard and the Website API read.
 */

export const GALLERY_LIMITS = {
  title: 120,
  description: 1000,
  caption: 200,
  photosPerAlbum: 60,
  albumsPerSchool: 200,
};

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

/**
 * Validate an album create/update. `partial` allows leaving fields out (PATCH).
 * `photos`, when given, is the album's full ordered list:
 * [{ asset: "<MediaAsset id>", caption }]. Returns `{ data }` or `{ error }`.
 */
export function parseAlbumInput(body, { partial = false } = {}) {
  if (!body || typeof body !== "object") return { error: "Nothing to save." };
  const data = {};

  if (!partial || body.title !== undefined) {
    const title = clean(body.title);
    if (title.length < 2) return { error: "Give the album a title." };
    if (title.length > GALLERY_LIMITS.title) return { error: "The title is too long." };
    data.title = title;
  }
  if (!partial || body.description !== undefined) {
    const description = String(body.description ?? "").trim();
    if (description.length > GALLERY_LIMITS.description) return { error: "The description is too long." };
    data.description = description;
  }
  if (!partial || body.takenOn !== undefined) {
    if (body.takenOn) {
      const takenOn = new Date(body.takenOn);
      if (Number.isNaN(takenOn.getTime())) return { error: "Enter a valid date." };
      data.takenOn = takenOn;
    } else {
      data.takenOn = null;
    }
  }
  if (!partial || body.status !== undefined) {
    const status = String(body.status || "DRAFT").toUpperCase();
    if (!["DRAFT", "PUBLIC"].includes(status)) return { error: "Choose draft or public." };
    data.status = status;
  }
  if (body.photos !== undefined) {
    if (!Array.isArray(body.photos)) return { error: "Photos must be a list." };
    if (body.photos.length > GALLERY_LIMITS.photosPerAlbum) {
      return { error: `An album holds up to ${GALLERY_LIMITS.photosPerAlbum} photos. Start another album.` };
    }
    const seen = new Set();
    const photos = [];
    for (const photo of body.photos) {
      const asset = String(photo?.asset || "");
      if (!isObjectId(asset)) return { error: "A photo is missing its upload." };
      if (seen.has(asset)) continue;
      seen.add(asset);
      const caption = clean(photo?.caption);
      if (caption.length > GALLERY_LIMITS.caption) return { error: "A caption is too long." };
      photos.push({ asset, caption });
    }
    data.photos = photos;
  }
  return { data };
}

const photoOut = (photo, origin = "") => ({
  id: String(photo._id || photo.asset),
  asset: String(photo.asset),
  url: `${origin}${photo.url}`,
  caption: photo.caption || "",
  width: photo.width || 0,
  height: photo.height || 0,
});

/** The album as the school's Gallery screen shows it. */
export function serializeAlbumForSchool(row) {
  return {
    id: String(row._id),
    title: row.title,
    description: row.description || "",
    takenOn: row.takenOn || null,
    status: row.status,
    publishedAt: row.publishedAt || null,
    updatedAt: row.updatedAt || null,
    photos: (row.photos || []).map((photo) => photoOut(photo)),
  };
}

/**
 * The album as a school website reads it. `origin` makes photo URLs absolute
 * so they load on another domain. `withPhotos: false` gives the list shape
 * (cover + count only).
 */
export function serializeAlbumForWebsite(row, origin, { withPhotos = true } = {}) {
  const photos = row.photos || [];
  const cover = photos[0] ? photoOut(photos[0], origin) : null;
  return {
    id: String(row._id),
    title: row.title,
    description: row.description || "",
    takenOn: row.takenOn || null,
    publishedAt: row.publishedAt || null,
    coverUrl: cover?.url || "",
    photoCount: photos.length,
    ...(withPhotos ? { photos: photos.map((photo) => photoOut(photo, origin)) } : {}),
  };
}
