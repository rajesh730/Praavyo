jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/Student", () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock("@/models/AcademicYear", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), deleteOne: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@/models/PromotionRun", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@pravyo/db/models/cas/CasExam", () => ({ __esModule: true, default: { countDocuments: jest.fn() } }));
jest.mock("@pravyo/db/models/cas/CasAssessment", () => ({ __esModule: true, default: { countDocuments: jest.fn() } }));
jest.mock("@pravyo/db/models/cas/InternalExam", () => ({ __esModule: true, default: { countDocuments: jest.fn() } }));
jest.mock("mongoose", () => ({
  __esModule: true,
  default: {
    startSession: jest.fn().mockResolvedValue({ withTransaction: async (fn) => fn(), endSession: jest.fn() }),
  },
}));

import { getServerSession } from "next-auth";
import Student from "@/models/Student";
import AcademicYear from "@/models/AcademicYear";
import PromotionRun from "@/models/PromotionRun";
import CasExam from "@pravyo/db/models/cas/CasExam";
import CasAssessment from "@pravyo/db/models/cas/CasAssessment";
import InternalExam from "@pravyo/db/models/cas/InternalExam";
import { stateFingerprint, studentState, undoBlocker } from "@/lib/promotionUndo";
import { GET, POST } from "@/app/api/school/academic-year/undo-promotion/route";

/**
 * "Promote year" pressed by mistake: Undo last promotion puts every student
 * and both school years back, all or nothing.
 */

const SCHOOL = "sch1";
const enrollment = (grade, status, yearStart) => ({ school: SCHOOL, grade, status, academicYearStart: yearStart });

function student(id, now, before) {
  const doc = { _id: id, name: id, ...now, save: jest.fn().mockResolvedValue(undefined) };
  return { doc, row: { student: id, name: id, outcome: "promoted", before, afterFingerprint: stateFingerprint(studentState(doc)) } };
}

let run;
let students;
const order = [];

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  getServerSession.mockResolvedValue({ user: { id: SCHOOL, role: "SCHOOL_ADMIN" } });

  const ukgBefore = { grade: "UKG", section: "", rollNumber: "4", status: "ACTIVE", enrollments: [enrollment("UKG", "CURRENT", 2025)] };
  const ukg = student(
    "s-ukg",
    { grade: "Grade 1", section: "", rollNumber: "4", status: "ACTIVE", enrollments: [enrollment("UKG", "PROMOTED", 2025), enrollment("Grade 1", "CURRENT", 2026)] },
    ukgBefore
  );
  const topBefore = { grade: "Grade 10", section: "A", rollNumber: "9", status: "ACTIVE", enrollments: [enrollment("Grade 10", "CURRENT", 2025)] };
  const top = student(
    "s-top",
    { grade: "Grade 10", section: "A", rollNumber: "9", status: "ALUMNI", statusReason: "Graduated (2025)", enrollments: [enrollment("Grade 10", "GRADUATED", 2025)] },
    topBefore
  );
  top.row.outcome = "graduated";
  for (const entry of [ukg, top]) entry.doc.save.mockImplementation(async () => order.push(entry.doc._id));
  students = [top.doc, ukg.doc];

  run = {
    _id: "run1",
    status: "COMPLETED",
    createdAt: new Date(),
    fromYear: { id: "ay1", year: "2025", summaryBefore: { admitted: 30 } },
    toYear: { id: "ay2", year: "2026", yearStart: 2026, created: true },
    students: [top.row, ukg.row],
    summary: { promoted: 1, retained: 0, graduated: 1 },
    save: jest.fn().mockResolvedValue(undefined),
  };
  PromotionRun.findOne.mockReturnValue({ sort: () => Promise.resolve(run) });
  AcademicYear.findOne.mockImplementation(({ _id }) => ({
    lean: () =>
      Promise.resolve(
        _id === "ay1"
          ? { _id: "ay1", year: "2025", yearStart: 2025, status: "CLOSED" }
          : { _id: "ay2", year: "2026", yearStart: 2026, status: "ACTIVE" }
      ),
  }));
  Student.find.mockResolvedValue(students);
  Student.countDocuments.mockResolvedValue(0);
  for (const model of [CasExam, CasAssessment, InternalExam]) model.countDocuments.mockResolvedValue(0);
});

const post = (body = { confirm: true }) =>
  POST(new Request("http://localhost/api/school/academic-year/undo-promotion", { method: "POST", body: JSON.stringify(body) }));

describe("Undo last promotion", () => {
  it("is offered right after a promotion", async () => {
    const json = await (await GET()).json();
    expect(json.data).toMatchObject({ available: true, blocker: "" });
  });

  it("puts every student back, lowest grade first, and rolls the years back", async () => {
    const res = await post();
    expect(res.status).toBe(200);

    const [top, ukg] = students;
    expect(ukg).toMatchObject({ grade: "UKG", status: "ACTIVE" });
    expect(ukg.enrollments).toEqual([enrollment("UKG", "CURRENT", 2025)]);
    expect(top).toMatchObject({ grade: "Grade 10", status: "ACTIVE", section: "A" });
    expect(order).toEqual(["s-ukg", "s-top"]);

    // New year removed first, then the previous one reopens with its summary.
    expect(AcademicYear.deleteOne).toHaveBeenCalledWith({ _id: "ay2", school: SCHOOL }, expect.anything());
    expect(AcademicYear.updateOne).toHaveBeenCalledWith(
      { _id: "ay1", school: SCHOOL },
      { $set: { status: "ACTIVE", closedAt: null, closedBy: null, summary: { admitted: 30 } } },
      expect.anything()
    );
    expect(run.status).toBe("UNDONE");
  });

  it("changes nothing when exams were already recorded in the new year", async () => {
    CasExam.countDocuments.mockResolvedValue(1);
    const res = await post();
    expect(res.status).toBe(409);
    expect(students.every((doc) => doc.save.mock.calls.length === 0)).toBe(true);
    expect(AcademicYear.deleteOne).not.toHaveBeenCalled();
  });

  it("changes nothing when students were admitted into the new year", async () => {
    Student.countDocuments.mockResolvedValue(2);
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/2 students were admitted/);
  });

  it("changes nothing when a student was edited after the promotion", async () => {
    students[1].rollNumber = "12";
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/changed after the promotion/);
    expect(students[0].save).not.toHaveBeenCalled();
  });

  it("cannot run twice", async () => {
    run.status = "UNDONE";
    expect((await post()).status).toBe(409);
  });

  it("needs confirmation", async () => {
    expect((await post({})).status).toBe(400);
  });
});

describe("undoBlocker", () => {
  const years = { from: { status: "CLOSED" }, to: { status: "ACTIVE" } };

  it("allows a recent promotion", () => {
    expect(undoBlocker({ run: { status: "COMPLETED", createdAt: new Date() }, years })).toBe("");
  });

  it("stops after the undo window", () => {
    const old = new Date(Date.now() - 31 * 86_400_000);
    expect(undoBlocker({ run: { status: "COMPLETED", createdAt: old }, years })).toMatch(/within 30 days/);
  });
});
