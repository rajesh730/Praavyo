jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/lib/transferNotifications", () => ({
  notifyReleaseRequested: jest.fn(),
  notifyAdmissionRequested: jest.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, POST, PATCH } from "@/app/api/student/transfer/route";

function req(body) {
  return new Request("http://localhost/api/student/transfer", {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

describe("student transfer route — auth guards", () => {
  beforeEach(() => jest.clearAllMocks());

  it("GET requires authentication", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST rejects a non-student role", async () => {
    getServerSession.mockResolvedValue({
      user: { id: "u1", role: "SCHOOL_ADMIN" },
    });
    const res = await POST(req({ reason: "x" }));
    expect(res.status).toBe(403);
  });

  // Transfers are requested by the parent or guardian in the parent app, so
  // this route never starts or changes one — for anyone, signed in or not.
  it("PATCH never changes a transfer, whoever asks", async () => {
    getServerSession.mockResolvedValue(null);
    expect((await PATCH(req({ action: "cancel" }))).status).toBe(403);

    getServerSession.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await PATCH(req({ action: "cancel" }))).status).toBe(403);
  });

  it("POST never starts a transfer, even for a student", async () => {
    getServerSession.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    const res = await POST(req({ reason: "Moving house" }));
    expect(res.status).toBe(403);
  });
});
