jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/User", () => ({ __esModule: true, default: { exists: jest.fn() } }));
jest.mock("@/models/SchoolInquiry", () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock("@/lib/rateLimit", () => ({ applyRateLimit: jest.fn() }));

import User from "@/models/User";
import SchoolInquiry from "@/models/SchoolInquiry";
import { applyRateLimit } from "@/lib/rateLimit";
import { POST } from "@/app/api/public/schools/[id]/inquiries/route";

const SCHOOL_ID = "65f0c0ffee0000000000abcd";
const valid = {
  name: "Sita Sharma",
  email: "sita@gmail.com",
  phone: "9841234567",
  subject: "Admission for Grade 3",
  message: "Is there a seat in Grade 3 this year?",
};

function send(body, id = SCHOOL_ID) {
  return POST(
    new Request(`http://localhost/api/public/schools/${id}/inquiries`, {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  applyRateLimit.mockResolvedValue({ ok: true });
  User.exists.mockResolvedValue({ _id: SCHOOL_ID });
  SchoolInquiry.create.mockResolvedValue({});
});

describe("public school inquiry route", () => {
  it("saves a valid inquiry for an approved school, without echoing it back", async () => {
    const res = await send(valid);
    expect(res.status).toBe(201);
    expect(SchoolInquiry.create).toHaveBeenCalledWith(expect.objectContaining({ ...valid, school: SCHOOL_ID }));
    expect((await res.json()).data).toEqual({});
    expect(User.exists).toHaveBeenCalledWith(
      expect.objectContaining({ _id: SCHOOL_ID, role: "SCHOOL_ADMIN", status: { $in: ["APPROVED", "SUBSCRIBED"] } })
    );
  });

  it("quietly drops a submission that filled the hidden bot field", async () => {
    const res = await send({ ...valid, website: "http://spam.example" });
    expect(res.status).toBe(201);
    expect(SchoolInquiry.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid inquiry with the first problem", async () => {
    const res = await send({ ...valid, email: "nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Enter a valid email address.");
    expect(SchoolInquiry.create).not.toHaveBeenCalled();
  });

  it("limits how often one visitor can send", async () => {
    applyRateLimit.mockResolvedValueOnce({ ok: false, retryAfter: 600 });
    const res = await send(valid);
    expect(res.status).toBe(429);
    expect(SchoolInquiry.create).not.toHaveBeenCalled();
  });

  it("refuses a school that does not exist or is not approved", async () => {
    User.exists.mockResolvedValue(null);
    const res = await send(valid);
    expect(res.status).toBe(404);
    expect(SchoolInquiry.create).not.toHaveBeenCalled();
  });

  it("refuses a malformed school id", async () => {
    const res = await send(valid, "not-an-id");
    expect(res.status).toBe(404);
  });
});
