jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/SchoolConfig", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { aggregate: jest.fn(), updateMany: jest.fn() },
}));
jest.mock("@pravyo/db/models/cas/CasSubject", () => ({
  __esModule: true,
  default: { updateMany: jest.fn() },
}));
jest.mock("@/lib/schoolGrades", () => ({
  buildGradeLabels: () => ["Grade 1", "Grade 3"],
  // The school's current grades (its edited list, else the signup range).
  resolveSchoolGrades: () => ["Grade 1", "Grade 3"],
  getEquivalentGradeValues: (grade) => [grade, grade.replace("Grade ", "")],
}));

import { getServerSession } from "next-auth";
import SchoolConfig from "@/models/SchoolConfig";
import User from "@/models/User";
import Student from "@/models/Student";
import { DELETE, PATCH, POST } from "@/app/api/school/sections/route";

const lean = (value) => ({ select: () => ({ lean: async () => value }) });
const body = (data) => new Request("http://localhost/api/school/sections", { method: "POST", body: JSON.stringify(data) });

describe("Manage Sections", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "school-1", role: "SCHOOL_ADMIN" } });
    User.findById.mockReturnValue(lean({ schoolConfig: {} }));
    SchoolConfig.findOne.mockReturnValue(lean({ gradeSections: [{ grade: "Grade 3", sections: ["A", "B"] }] }));
  });

  it("deleting a section moves its current students to No section and saves at once", async () => {
    Student.updateMany.mockResolvedValue({ modifiedCount: 4 });

    const res = await DELETE(body({ grade: "Grade 3", name: "a" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.students).toBe(4);
    expect(Student.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ school: "school-1", grade: { $in: ["Grade 3", "3"] } }),
      { $set: { section: "" } },
    );
    const saved = SchoolConfig.findOneAndUpdate.mock.calls[0][1].$set.gradeSections;
    expect(saved.find((row) => row.grade === "Grade 3").sections).toEqual(["B"]);
  });

  it("renaming a section moves its students to the new name", async () => {
    Student.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const res = await PATCH(body({ grade: "Grade 3", from: "B", to: "Blue" }));

    expect(res.status).toBe(200);
    expect(Student.updateMany).toHaveBeenCalledWith(expect.anything(), { $set: { section: "Blue" } });
    const saved = SchoolConfig.findOneAndUpdate.mock.calls[0][1].$set.gradeSections;
    expect(saved.find((row) => row.grade === "Grade 3").sections).toEqual(["A", "Blue"]);
  });

  it("refuses a duplicate section name in the same grade", async () => {
    const res = await POST(body({ grade: "Grade 3", name: "b" }));

    expect(res.status).toBe(409);
    expect(SchoolConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps the sections of a grade the school removed, so adding it back restores them", async () => {
    // "Grade 5" was removed in Settings → Grades; its sections are still stored.
    SchoolConfig.findOne.mockReturnValue(
      lean({ gradeSections: [{ grade: "Grade 3", sections: ["A", "B"] }, { grade: "Grade 5", sections: ["Rose", "Lily"] }] })
    );
    Student.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const res = await DELETE(body({ grade: "Grade 3", name: "A" }));

    expect(res.status).toBe(200);
    const saved = SchoolConfig.findOneAndUpdate.mock.calls[0][1].$set.gradeSections;
    expect(saved.find((row) => row.grade === "Grade 5").sections).toEqual(["Rose", "Lily"]);
  });

  it("refuses a grade the school does not have", async () => {
    const res = await POST(body({ grade: "Grade 12", name: "A" }));

    expect(res.status).toBe(400);
  });
});
