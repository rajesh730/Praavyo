jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/lib/teacherAccounts", () => ({
  loadSchoolTeacher: jest.fn().mockResolvedValue({ teacher: { _id: "t1" }, membership: { status: "ACTIVE" } }),
}));
jest.mock("@/lib/schoolGradeConfig", () => ({ loadSchoolGrades: jest.fn() }));
jest.mock("@pravyo/db/models/cas/CasSubject", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/TeacherTeachingAssignment", () => ({
  __esModule: true,
  default: { find: jest.fn(), deleteMany: jest.fn(), insertMany: jest.fn() },
}));

import { getServerSession } from "next-auth";
import { loadSchoolGrades } from "@/lib/schoolGradeConfig";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { GET, PUT } from "@/app/api/teachers/[id]/teaching-assignments/route";

/**
 * A grade removed in Settings → Grades and added back later brings back its
 * teacher assignments: while removed they are kept (hidden), and saving a
 * teacher never deletes them.
 */

const TEACHER = "65f0c0ffee0000000000aaaa";
const SUBJECT = "65f0c0ffee0000000000bbbb";
const ctx = { params: Promise.resolve({ id: TEACHER }) };

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "sch1", role: "SCHOOL_ADMIN" } });
  // The school now offers Grade 1 and Grade 2; UKG was removed.
  loadSchoolGrades.mockResolvedValue(["Grade 1", "Grade 2"]);
  CasSubject.find.mockReturnValue({
    select: () => ({ sort: () => ({ lean: () => Promise.resolve([{ _id: SUBJECT, grade: "Grade 1", code: "ENG", titleEn: "English" }]) }) }),
  });
  TeacherTeachingAssignment.find.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });
  TeacherTeachingAssignment.deleteMany.mockResolvedValue({});
  TeacherTeachingAssignment.insertMany.mockResolvedValue([]);
});

it("shows only assignments in grades the school offers now", async () => {
  await GET(new Request("http://localhost"), ctx);
  expect(TeacherTeachingAssignment.find).toHaveBeenCalledWith({
    school: "sch1",
    teacher: TEACHER,
    grade: { $in: ["Grade 1", "Grade 2"] },
  });
});

it("replaces only the shown grades, keeping a removed grade's assignments", async () => {
  const res = await PUT(
    new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ assignments: [{ grade: "Grade 1", assignmentType: "SUBJECT_TEACHER", subject: SUBJECT }] }),
    }),
    ctx
  );
  expect(res.status).toBe(200);
  expect(TeacherTeachingAssignment.deleteMany).toHaveBeenCalledWith({
    school: "sch1",
    teacher: TEACHER,
    grade: { $in: ["Grade 1", "Grade 2"] },
  });
});
