jest.mock("@/models/MediaAsset", () => ({
  __esModule: true,
  default: { find: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@/lib/r2Storage", () => ({
  bucketForVisibility: jest.fn(() => "praavyo-public"),
  r2ObjectExists: jest.fn(),
  deleteR2Object: jest.fn(),
}));

import MediaAsset from "@/models/MediaAsset";
import { deleteR2Object, r2ObjectExists } from "@/lib/r2Storage";
import { deleteMediaAssets } from "@/lib/mediaCleanup";

const asset = (extra = {}) => ({
  _id: "a1",
  visibility: "PUBLIC",
  storageKey: "schools/s1/school_logo/x.webp",
  status: "READY",
  ...extra,
});

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteMediaAssets", () => {
  it("deletes and marks DELETED only when the object is in this bucket", async () => {
    MediaAsset.find.mockReturnValue({ lean: () => Promise.resolve([asset()]) });
    r2ObjectExists.mockResolvedValue(true);

    await deleteMediaAssets({ _id: "a1" });

    expect(deleteR2Object).toHaveBeenCalledTimes(1);
    expect(MediaAsset.updateOne).toHaveBeenCalledWith(
      { _id: "a1", status: "READY" },
      { $set: { status: "DELETED", deletedAt: expect.any(Date) } }
    );
  });

  // The 2026-11 incident: an environment pointed at another bucket "deleted"
  // a live logo (R2 says OK for a missing key) and marked it DELETED.
  it("never marks an asset DELETED when this bucket does not hold it", async () => {
    MediaAsset.find.mockReturnValue({ lean: () => Promise.resolve([asset()]) });
    r2ObjectExists.mockResolvedValue(false);

    await deleteMediaAssets({ _id: "a1" });

    expect(deleteR2Object).not.toHaveBeenCalled();
    expect(MediaAsset.updateOne).not.toHaveBeenCalled();
  });

  it("never touches an asset recorded in a different bucket", async () => {
    MediaAsset.find.mockReturnValue({
      lean: () => Promise.resolve([asset({ bucket: "some-other-bucket" })]),
    });
    r2ObjectExists.mockResolvedValue(true);

    await deleteMediaAssets({ _id: "a1" });

    expect(r2ObjectExists).not.toHaveBeenCalled();
    expect(deleteR2Object).not.toHaveBeenCalled();
    expect(MediaAsset.updateOne).not.toHaveBeenCalled();
  });

  it("leaves the asset READY when R2 cannot be reached", async () => {
    MediaAsset.find.mockReturnValue({ lean: () => Promise.resolve([asset()]) });
    r2ObjectExists.mockRejectedValue(new Error("network down"));

    await deleteMediaAssets({ _id: "a1" });

    expect(deleteR2Object).not.toHaveBeenCalled();
    expect(MediaAsset.updateOne).not.toHaveBeenCalled();
  });
});
