jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/SchoolConfig", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    collection: { findOne: jest.fn() },
  },
}));
jest.mock("@/models/Student", () => ({ __esModule: true, default: { aggregate: jest.fn() } }));

import { getServerSession } from "next-auth";
import User from "@/models/User";
import SchoolConfig from "@/models/SchoolConfig";
import Student from "@/models/Student";
import { GET, PUT } from "@/app/api/school/grade-structure/route";

/**
 * Settings → Academic Setup → Grades. A school's grades are editable after
 * signup (Nursery, LKG, UKG, Grade 1–12); removing a grade never touches
 * students, and a grade with students on the roll cannot be removed.
 */

const SCHOOL = "65f0c0ffee0000000000abcd";
const SIGNUP = { schoolLevel: { minGrade: 1, maxGrade: 10 } };
const tenGrades = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);

const leanOf = (value) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

function config(overrides = {}) {
  const doc = { _id: "cfg", grades: tenGrades, gradesCustomized: false, save: jest.fn(), ...overrides };
  SchoolConfig.findOne.mockResolvedValue(doc);
  return doc;
}

const put = (grades) =>
  PUT(new Request("http://localhost/api/school/grade-structure", { method: "PUT", body: JSON.stringify({ grades }) }));

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: SCHOOL, role: "SCHOOL_ADMIN" } });
  User.findById.mockReturnValue(leanOf({ schoolConfig: SIGNUP }));
  Student.aggregate.mockResolvedValue([]);
  // What the database holds after a save: whatever the save wrote.
  let stored = null;
  SchoolConfig.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    stored = { ...update.$set };
    return stored;
  });
  SchoolConfig.collection.findOne.mockImplementation(async () => stored);
  SchoolConfig.updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe("PUT /api/school/grade-structure", () => {
  it("adds Nursery, LKG and UKG and removes an empty Grade 10", async () => {
    config();
    const next = ["Nursery", "lkg", "UKG", ...tenGrades.slice(0, 9)];
    const res = await put(next);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.added).toEqual(["Nursery", "LKG", "UKG"]);
    expect(json.data.removed).toEqual(["Grade 10"]);
    expect(SchoolConfig.findOneAndUpdate).toHaveBeenCalledWith(
      { school: SCHOOL },
      {
        $set: { grades: ["Nursery", "LKG", "UKG", ...tenGrades.slice(0, 9)], gradesCustomized: true },
        $setOnInsert: { school: SCHOOL },
      },
      expect.objectContaining({ strict: false })
    );
  });

  it("does not say saved when the database did not keep the change (a stale server model)", async () => {
    config();
    SchoolConfig.collection.findOne.mockResolvedValue({ grades: ["Nursery", ...tenGrades] });
    const res = await put(["Nursery", ...tenGrades]);
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("refuses to remove a grade that still has students, and saves nothing", async () => {
    config();
    Student.aggregate.mockResolvedValue([{ _id: "Grade 10", count: 23 }, { _id: "10", count: 2 }]);
    const res = await put(tenGrades.slice(0, 9));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("GRADE_HAS_STUDENTS");
    expect(json.data.blocked).toEqual([{ grade: "Grade 10", students: 25 }]);
    expect(SchoolConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("only offers catalogue grades", async () => {
    config();
    const res = await put(["Grade 1", "Grade 15"]);
    expect(res.status).toBe(400);
    expect(SchoolConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps at least one grade", async () => {
    config();
    expect((await put([])).status).toBe(400);
  });

  it("is for school admins only", async () => {
    getServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: SCHOOL } });
    expect((await put(["Grade 1"])).status).toBe(403);
  });
});

describe("GET /api/school/grade-structure", () => {
  const get = (query = "") => GET(new Request(`http://localhost/api/school/grade-structure${query}`));

  it("returns the school's edited list and never overwrites it with the signup range", async () => {
    const doc = config({ gradesCustomized: true, grades: ["Nursery", "LKG", "Grade 1"] });
    const json = await (await get()).json();
    expect(json.grades.map((grade) => grade.name)).toEqual(["Nursery", "LKG", "Grade 1"]);
    expect(json.customized).toBe(true);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("keeps an unedited school's copy in sync with its signup range", async () => {
    config({ grades: [] });
    const json = await (await get()).json();
    expect(json.grades).toHaveLength(10);
    expect(SchoolConfig.updateOne).toHaveBeenCalledWith(
      { _id: "cfg", gradesCustomized: { $ne: true } },
      { $set: { grades: tenGrades } }
    );
  });

  it("never overwrites an edited list, even when this server cannot see the flag", async () => {
    // The in-memory doc misses `gradesCustomized` (stale model); the database has it.
    config({ grades: tenGrades.slice(0, 2), gradesCustomized: undefined });
    SchoolConfig.updateOne.mockResolvedValue({ matchedCount: 0 });
    SchoolConfig.collection.findOne.mockResolvedValue({ grades: ["Nursery", "LKG", "Grade 1"], gradesCustomized: true });
    const json = await (await get()).json();
    expect(json.grades.map((grade) => grade.name)).toEqual(["Nursery", "LKG", "Grade 1"]);
  });

  it("adds student counts and the catalogue for the Grades screen", async () => {
    config({ gradesCustomized: true, grades: ["Nursery", "Grade 1"] });
    Student.aggregate.mockResolvedValue([{ _id: "nursery", count: 4 }, { _id: "1", count: 30 }]);
    const json = await (await get("?counts=1")).json();
    expect(json.studentCounts).toEqual({ Nursery: 4, "Grade 1": 30 });
    expect(json.catalog.find((item) => item.name === "UKG")).toEqual({ name: "UKG", cas: true });
    expect(json.catalog.find((item) => item.name === "Grade 6")).toEqual({ name: "Grade 6", cas: false });
  });
});
