// The media read route must never write to the database. One MongoDB is
// shared by every deployment, so a read that "cleans up" a missing object
// wiped live school logos and covers twice (2026-11-04 and 2026-11-06).
jest.mock("@/lib/db", () => jest.fn(() => Promise.resolve()));
jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/r2Storage", () => ({
  ...jest.requireActual("@/lib/r2Storage"),
  getR2Object: jest.fn(),
}));
jest.mock("@/models/MediaAsset", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    deleteOne: jest.fn(),
  },
}));
jest.mock("@/models/SchoolShowcaseProfile", () => ({
  __esModule: true,
  default: { updateOne: jest.fn(), updateMany: jest.fn() },
}));
jest.mock("@/models/SchoolConfig", () => ({
  __esModule: true,
  default: { updateOne: jest.fn(), updateMany: jest.fn() },
}));
jest.mock("@/models/SchoolMagazineArticle", () => ({
  __esModule: true,
  default: { exists: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() },
}));
jest.mock("@/models/ParentStudentLink", () => ({
  __esModule: true,
  default: { exists: jest.fn() },
}));
jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import MediaAsset from "@/models/MediaAsset";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import SchoolConfig from "@/models/SchoolConfig";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { getR2Object } from "@/lib/r2Storage";
import { GET } from "@/app/api/media/r2/[id]/route";

const ID = "6aebb7be2854d61f3b46d4e7";

function expectNoWrites() {
  for (const fn of [
    MediaAsset.updateOne,
    MediaAsset.updateMany,
    MediaAsset.deleteOne,
    SchoolShowcaseProfile.updateOne,
    SchoolShowcaseProfile.updateMany,
    SchoolConfig.updateOne,
    SchoolConfig.updateMany,
    SchoolMagazineArticle.updateOne,
    SchoolMagazineArticle.updateMany,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  MediaAsset.findOne.mockReturnValue({
    lean: () =>
      Promise.resolve({
        _id: ID,
        school: "s1",
        purpose: "SCHOOL_LOGO",
        visibility: "PUBLIC",
        status: "READY",
        storageKey: "schools/s1/school_logo/x.webp",
        mimeType: "image/webp",
        sizeBytes: 10,
      }),
  });
});

describe("GET /api/media/r2/[id]", () => {
  it("returns 404 for a missing object without touching the database", async () => {
    getR2Object.mockRejectedValue(
      Object.assign(new Error("missing"), {
        name: "NoSuchKey",
        $metadata: { httpStatusCode: 404 },
      })
    );

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(404);
    expectNoWrites();
  });

  it("returns 502 on a storage outage without touching the database", async () => {
    getR2Object.mockRejectedValue(new Error("network down"));

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: ID }) });

    expect(res.status).toBe(502);
    expectNoWrites();
  });
});
