jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/SchoolShowcaseProfile", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { GET } from "@/app/api/schools/[id]/logo/route";

const SCHOOL = "64b000000000000000000001";
const profile = (row) => ({ select: () => ({ lean: () => Promise.resolve(row) }) });
const call = (id) => GET(new Request(`https://www.praavyo.com/api/schools/${id}/logo`), { params: Promise.resolve({ id }) });

describe("GET /api/schools/[id]/logo (notification picture)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("redirects to the school's logo", async () => {
    SchoolShowcaseProfile.findOne.mockReturnValue(profile({ logoUrl: "/api/media/r2/64b0000000000000000000aa" }));
    const res = await call(SCHOOL);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.praavyo.com/api/media/r2/64b0000000000000000000aa");
  });

  it("falls back to the Praavyo logo when the school has none", async () => {
    SchoolShowcaseProfile.findOne.mockReturnValue(profile(null));
    const res = await call(SCHOOL);
    expect(res.headers.get("location")).toBe("https://www.praavyo.com/pravyo-icon.png?v=2");
  });

  it("never redirects to an unsafe address, and ignores bad ids", async () => {
    SchoolShowcaseProfile.findOne.mockReturnValue(profile({ logoUrl: "javascript:alert(1)" }));
    expect((await call(SCHOOL)).headers.get("location")).toBe("https://www.praavyo.com/pravyo-icon.png?v=2");
    expect((await call("not-an-id")).headers.get("location")).toBe("https://www.praavyo.com/pravyo-icon.png?v=2");
    expect(SchoolShowcaseProfile.findOne).toHaveBeenCalledTimes(1);
  });
});
