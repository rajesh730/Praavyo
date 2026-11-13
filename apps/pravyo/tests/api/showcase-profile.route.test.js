jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn(() => Promise.resolve()));
jest.mock("@/lib/certificates", () => ({ getActiveCertificateFilter: jest.fn(() => ({})) }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/models/Event", () => ({ __esModule: true, default: { countDocuments: jest.fn() } }));
jest.mock("@/models/Achievement", () => ({ __esModule: true, default: { countDocuments: jest.fn() } }));
jest.mock("@/models/ParticipationRequest", () => ({ __esModule: true, default: { distinct: jest.fn() } }));
jest.mock("@/models/SchoolShowcaseProfile", () => ({
  __esModule: true,
  default: { findOneAndUpdate: jest.fn() },
}));

import { requireApiSession } from "@/lib/authz";
import Event from "@/models/Event";
import Achievement from "@/models/Achievement";
import ParticipationRequest from "@/models/ParticipationRequest";
import SchoolShowcaseProfile from "@/models/SchoolShowcaseProfile";
import { PUT } from "@/app/api/school/showcase-profile/route";

const SCHOOL_ID = "6aebb7be2854d61f3b46d4e7";

beforeEach(() => {
  requireApiSession.mockResolvedValue({
    session: { user: { id: SCHOOL_ID, role: "SCHOOL_ADMIN" } },
  });
  Event.countDocuments.mockResolvedValue(0);
  Achievement.countDocuments.mockResolvedValue(0);
  ParticipationRequest.distinct.mockResolvedValue([]);
  SchoolShowcaseProfile.findOneAndUpdate.mockResolvedValue({ school: SCHOOL_ID });
});

describe("PUT /api/school/showcase-profile", () => {
  it("cannot overwrite the independently managed logo even when an old client submits one", async () => {
    const response = await PUT(
      new Request("http://localhost/api/school/showcase-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagline: "A school",
          logoUrl: "/api/media/r2/8aebb7be2854d61f3b46d4e7",
          coverImageUrl: "",
        }),
      })
    );

    expect(response.status).toBe(200);
    const update = SchoolShowcaseProfile.findOneAndUpdate.mock.calls[0][1].$set;
    expect(update).not.toHaveProperty("logoUrl");
    expect(update).not.toHaveProperty("coverImageUrl");
  });
});
