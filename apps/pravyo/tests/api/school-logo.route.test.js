jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn(() => Promise.resolve()));
jest.mock("@/lib/mediaCleanup", () => ({ deleteMediaAssets: jest.fn() }));
jest.mock("@/models/MediaAsset", () => ({
  __esModule: true,
  default: { exists: jest.fn() },
}));
jest.mock("@/models/SchoolShowcaseProfile", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));

import { requireApiSession } from "@/lib/authz";
import { deleteMediaAssets } from "@/lib/mediaCleanup";
import MediaAsset from "@/models/MediaAsset";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { PATCH } from "@/app/api/school/showcase-profile/logo/route";

const SCHOOL_ID = "6aebb7be2854d61f3b46d4e7";
const OLD_ASSET_ID = "7aebb7be2854d61f3b46d4e7";
const NEW_ASSET_ID = "8aebb7be2854d61f3b46d4e7";
const oldUrl = `/api/media/r2/${OLD_ASSET_ID}`;
const newUrl = `/api/media/r2/${NEW_ASSET_ID}`;

beforeEach(() => {
  requireApiSession.mockResolvedValue({
    session: { user: { id: SCHOOL_ID, role: "SCHOOL_ADMIN" } },
  });
  MediaAsset.exists.mockResolvedValue({ _id: NEW_ASSET_ID });
  SchoolShowcaseProfile.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ logoUrl: "", coverImageUrl: oldUrl }) }),
  });
  SchoolShowcaseProfile.findOneAndUpdate.mockReturnValue({
    lean: () => Promise.resolve({ logoUrl: newUrl, coverImageUrl: oldUrl }),
  });
});

describe("PATCH /api/school/showcase-profile/logo", () => {
  it("stores a replacement in the dedicated logo field and cleans up the prior legacy logo", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/school/showcase-profile/logo", {
        method: "PATCH",
        body: JSON.stringify({ logoUrl: newUrl }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(SchoolShowcaseProfile.findOneAndUpdate).toHaveBeenCalledWith(
      { school: SCHOOL_ID },
      { $set: { logoUrl: newUrl } },
      expect.objectContaining({ new: true, upsert: true })
    );
    expect(deleteMediaAssets).toHaveBeenCalledWith({
      _id: OLD_ASSET_ID,
      school: SCHOOL_ID,
      purpose: "SCHOOL_LOGO",
    });
  });
});
