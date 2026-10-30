jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { find: jest.fn(), bulkWrite: jest.fn() },
}));
jest.mock("@pravyo/db/models/cas/CasSubject", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import { getServerSession } from "next-auth";
import Student from "@/models/Student";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import { PUT } from "@/app/api/school/subjects/choices/route";

const STUDENT = "507f1f77bcf86cd799439011";
const COMPUTER = "507f1f77bcf86cd799439021";
const ACCOUNTS = "507f1f77bcf86cd799439022";
const chain = (value) => ({ select: () => ({ sort: () => ({ lean: async () => value }), lean: async () => value }) });
const put = (body) => new Request("http://localhost/api/school/subjects/choices", { method: "PUT", body: JSON.stringify(body) });

describe("school-assigned optional subjects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "school-1", role: "SCHOOL_ADMIN" } });
    CasSubject.find.mockReturnValue(chain([
      { _id: COMPUTER, titleEn: "Computer", optionalGroup: "Optional I", sections: [] },
      { _id: ACCOUNTS, titleEn: "Accounts", optionalGroup: "Optional I", sections: ["B"] },
    ]));
    Student.find.mockReturnValue(chain([{ _id: STUDENT, name: "Ram", section: "A", subjectChoices: [] }]));
  });

  it("saves one optional subject per group for a student", async () => {
    const res = await PUT(put({ grade: "Grade 10", assignments: [{ student: STUDENT, subjects: [COMPUTER] }] }));

    expect(res.status).toBe(200);
    expect(Student.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: STUDENT }, update: { $set: { subjectChoices: [COMPUTER] } } } },
    ], { ordered: false });
  });

  it("refuses two subjects from the same optional group", async () => {
    const res = await PUT(put({ grade: "Grade 10", assignments: [{ student: STUDENT, subjects: [COMPUTER, ACCOUNTS] }] }));

    expect(res.status).toBe(400);
    expect(Student.bulkWrite).not.toHaveBeenCalled();
  });

  it("refuses a subject that is not offered to the student's section", async () => {
    const res = await PUT(put({ grade: "Grade 10", assignments: [{ student: STUDENT, subjects: [ACCOUNTS] }] }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.message).toMatch(/not offered to section A/);
  });
});
