import { parseAlbumInput, serializeAlbumForWebsite } from "@/lib/schoolGallery";

const ASSET_A = "65f0c0ffee0000000000aaaa";
const ASSET_B = "65f0c0ffee0000000000bbbb";

describe("parseAlbumInput", () => {
  it("accepts a new album and defaults it to draft", () => {
    const { data } = parseAlbumInput({ title: "  Sports   Day ", description: "Fun", takenOn: "2026-11-20" });
    expect(data).toEqual({ title: "Sports Day", description: "Fun", takenOn: new Date("2026-11-20"), status: "DRAFT" });
  });

  it("requires a title, but a partial edit may leave it out", () => {
    expect(parseAlbumInput({ title: "x" }).error).toBe("Give the album a title.");
    expect(parseAlbumInput({ status: "public" }, { partial: true }).data).toEqual({ status: "PUBLIC" });
  });

  it("keeps the photo order, drops duplicates and checks ids", () => {
    const { data } = parseAlbumInput(
      { photos: [{ asset: ASSET_B, caption: " Race " }, { asset: ASSET_A }, { asset: ASSET_B }] },
      { partial: true }
    );
    expect(data.photos).toEqual([{ asset: ASSET_B, caption: "Race" }, { asset: ASSET_A, caption: "" }]);
    expect(parseAlbumInput({ photos: [{ asset: "nope" }] }, { partial: true }).error).toBe("A photo is missing its upload.");
  });

  it("limits an album to 60 photos", () => {
    const photos = Array.from({ length: 61 }, (_, i) => ({ asset: i.toString(16).padStart(24, "0") }));
    expect(parseAlbumInput({ photos }, { partial: true }).error).toMatch(/up to 60 photos/);
  });
});

describe("serializeAlbumForWebsite", () => {
  const row = {
    _id: "album1",
    title: "Sports Day",
    photos: [
      { _id: "p1", asset: ASSET_A, url: `/api/media/r2/${ASSET_A}`, caption: "Start" },
      { _id: "p2", asset: ASSET_B, url: `/api/media/r2/${ASSET_B}` },
    ],
  };

  it("makes photo URLs absolute and uses the first photo as the cover", () => {
    const album = serializeAlbumForWebsite(row, "https://www.praavyo.com");
    expect(album.coverUrl).toBe(`https://www.praavyo.com/api/media/r2/${ASSET_A}`);
    expect(album.photos[1].url).toBe(`https://www.praavyo.com/api/media/r2/${ASSET_B}`);
    expect(album.photoCount).toBe(2);
  });

  it("leaves photos out of the list shape", () => {
    expect(serializeAlbumForWebsite(row, "https://x", { withPhotos: false })).not.toHaveProperty("photos");
  });
});
