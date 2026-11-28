jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/User", () => ({ __esModule: true, default: { exists: jest.fn() } }));
jest.mock("@/models/SchoolInquiry", () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock("@/lib/rateLimit", () => ({ applyRateLimit: jest.fn() }));
jest.mock("@/lib/schoolAdmission", () => ({ getAdmissionSeason: jest.fn() }));
jest.mock("@/lib/devicePush", () => ({ pushSchoolInquiry: jest.fn() }));
jest.mock("@/lib/afterResponse", () => ({ runAfterResponse: (task) => task() }));

import User from "@/models/User";
import SchoolInquiry from "@/models/SchoolInquiry";
import { applyRateLimit } from "@/lib/rateLimit";
import { getAdmissionSeason } from "@/lib/schoolAdmission";
import { pushSchoolInquiry } from "@/lib/devicePush";
import { POST } from "@/app/api/public/schools/[id]/inquiries/route";

const SCHOOL_ID = "65f0c0ffee0000000000abcd";
const valid = {
  name: "Sita Sharma",
  email: "sita@gmail.com",
  phone: "9841234567",
  subject: "Admission for Grade 3",
  message: "Is there a seat in Grade 3 this year?",
};
const application = {
  type: "ADMISSION",
  studentName: "Aarav Thapa",
  grade: "Grade 3",
  guardianName: "Ram Thapa",
  phone: "9841234567",
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
  SchoolInquiry.create.mockImplementation(async (doc) => ({ _id: "new", ...doc }));
  getAdmissionSeason.mockResolvedValue({ season: { isOpen: true, academicYear: "2083", grades: ["Grade 3"] } });
});

describe("public school inquiry route", () => {
  it("saves a valid inquiry for an approved school as a Praavyo general inquiry, without echoing it back", async () => {
    const res = await send(valid);
    expect(res.status).toBe(201);
    expect(SchoolInquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({ ...valid, type: "GENERAL", source: "PRAAVYO", school: SCHOOL_ID })
    );
    expect((await res.json()).data).toEqual({});
    expect(User.exists).toHaveBeenCalledWith(
      expect.objectContaining({ _id: SCHOOL_ID, role: "SCHOOL_ADMIN", status: { $in: ["APPROVED", "SUBSCRIBED"] } })
    );
    expect(pushSchoolInquiry).toHaveBeenCalledWith(expect.objectContaining({ school: SCHOOL_ID, type: "GENERAL" }));
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

  it("saves an admission application while the season is open", async () => {
    const res = await send(application);
    expect(res.status).toBe(201);
    expect((await res.json()).message).toBe("Admission application sent");
    expect(SchoolInquiry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ADMISSION",
        source: "PRAAVYO",
        name: "Ram Thapa",
        admission: expect.objectContaining({ studentName: "Aarav Thapa", grade: "Grade 3", academicYear: "2083" }),
      })
    );
  });

  it("refuses an admission application once the season is closed", async () => {
    getAdmissionSeason.mockResolvedValue({ season: { isOpen: false, grades: [] } });
    const res = await send(application);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ADMISSION_CLOSED");
    expect(SchoolInquiry.create).not.toHaveBeenCalled();
  });
});
