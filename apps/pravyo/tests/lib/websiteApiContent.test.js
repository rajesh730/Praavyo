jest.mock("@/models/Event", () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock("@/models/PerformanceProgram", () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock("@/lib/schoolAdmission", () => ({ getAdmissionSeason: jest.fn() }));

import Event from "@/models/Event";
import PerformanceProgram from "@/models/PerformanceProgram";
import { websiteEvents, writingFilter } from "@/lib/websiteApi";
import { GENERAL_INQUIRY_FIELDS, admissionFields } from "@/lib/inquiryForms";
import { parseAdmissionApplication, parseInquiry } from "@/lib/schoolInquiries";

const chain = (rows) => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }) }) });
const request = (query = "") => new Request(`https://www.praavyo.com/api/v1/website/events${query}`);

describe("Website API: student writings", () => {
  it("serves what is on the school wall, plus publicly published writings", () => {
    const filter = writingFilter("sch1");
    expect(filter.school).toBe("sch1");
    expect(filter.$or).toEqual(
      expect.arrayContaining([
        { status: { $in: ["SUBMITTED", "APPROVED"] }, showOnSchoolWall: { $ne: false } },
        { status: "APPROVED", isPublished: true },
        { isMagazinePublished: true },
        { isGlobalWallPublished: true },
      ])
    );
  });
});

describe("Website API: events", () => {
  it("lists competitions and school programs together, newest first", async () => {
    Event.find.mockReturnValue(chain([{ _id: "e1", title: "Quiz", date: new Date("2026-05-01"), eventType: "COMPETITION" }]));
    PerformanceProgram.find.mockReturnValue(chain([{ _id: "p1", title: "Tihar program", venue: "Hall", date: new Date("2026-10-20") }]));
    Event.countDocuments.mockResolvedValue(1);
    PerformanceProgram.countDocuments.mockResolvedValue(1);

    const data = await websiteEvents("sch1", { request: request() });
    expect(data.items.map((item) => [item.title, item.kind])).toEqual([
      ["Tihar program", "PROGRAM"],
      ["Quiz", "COMPETITION"],
    ]);
    expect(data.items[0].venue).toBe("Hall");
    expect(data.pagination.total).toBe(2);
  });
});

describe("published form fields match what the server accepts", () => {
  const filled = (fields, values = {}) =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        values[field.name] ?? (field.type === "email" ? "a@b.co" : field.type === "tel" ? "9841234567" : field.options ? field.options[0] : "x".repeat(Math.max(field.minLength || 1, 12))),
      ])
    );

  it("a general inquiry filled from the definition is valid", () => {
    expect(parseInquiry(filled(GENERAL_INQUIRY_FIELDS)).error).toBeUndefined();
  });

  it("each required general field is really required", () => {
    for (const field of GENERAL_INQUIRY_FIELDS.filter((item) => item.required)) {
      expect(parseInquiry({ ...filled(GENERAL_INQUIRY_FIELDS), [field.name]: "" }).error).toBeTruthy();
    }
  });

  it("an admission application filled from the definition is valid, and required means required", () => {
    const fields = admissionFields(["Grade 1"]);
    const season = { isOpen: true, grades: ["Grade 1"] };
    expect(parseAdmissionApplication(filled(fields), season).error).toBeUndefined();
    for (const field of fields.filter((item) => item.required)) {
      expect(parseAdmissionApplication({ ...filled(fields), [field.name]: "" }, season).error).toBeTruthy();
    }
    // Optional ones can be left empty.
    const optional = Object.fromEntries(fields.filter((item) => !item.required).map((item) => [item.name, ""]));
    expect(parseAdmissionApplication({ ...filled(fields), ...optional }, season).error).toBeUndefined();
  });

  it("limits in the definition are the server's limits", () => {
    const message = GENERAL_INQUIRY_FIELDS.find((field) => field.name === "message");
    expect(parseInquiry({ ...filled(GENERAL_INQUIRY_FIELDS), message: "x".repeat(message.maxLength + 1) }).error).toMatch(/too long/);
  });
});
