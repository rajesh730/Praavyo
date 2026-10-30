jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("bcryptjs", () => ({ hash: jest.fn(async () => "hashed") }));
jest.mock("@/models/Teacher", () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn(), exists: jest.fn(), create: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@/models/Student", () => ({ __esModule: true, default: { exists: jest.fn() } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { exists: jest.fn(), updateOne: jest.fn() } }));
jest.mock("@pravyo/db/models/TeacherMembership", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), exists: jest.fn(), create: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@pravyo/db/teacherMemberships", () => ({
  endTeacherWorkAtSchool: jest.fn(),
  ensureTeacherIndexes: jest.fn(async () => {}),
}));

import { getServerSession } from "next-auth";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { endTeacherWorkAtSchool } from "@pravyo/db/teacherMemberships";
import { PATCH as setStatus } from "@/app/api/teachers/[id]/status/route";
import { POST as resetPassword } from "@/app/api/teachers/[id]/password/route";
import { POST as register } from "@/app/api/teachers/register/route";

const TEACHER_ID = "507f1f77bcf86cd799439011";
const lean = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
const context = () => ({ params: Promise.resolve({ id: TEACHER_ID }) });
const json = (body) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });

function teacherAtSchool(status) {
  Teacher.findById.mockReturnValue(lean({ _id: TEACHER_ID, name: "Sita", email: "sita@example.com" }));
  TeacherMembership.findOne.mockReturnValue(lean({ _id: "m1", teacher: TEACHER_ID, school: "school-a", status }));
}

describe("teacher membership administration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "school-a", role: "SCHOOL_ADMIN" } });
  });

  it("marks a teacher as left at this school only, archiving their work", async () => {
    teacherAtSchool("ACTIVE");
    endTeacherWorkAtSchool.mockResolvedValue([{ grade: "Grade 3", assignmentType: "CLASS_TEACHER" }]);

    const res = await setStatus(json({ status: "LEFT", leftAt: "2026-10-01", note: "Transferred" }), context());

    expect(res.status).toBe(200);
    expect(endTeacherWorkAtSchool).toHaveBeenCalledWith(TEACHER_ID, "school-a");
    expect(TeacherMembership.updateOne).toHaveBeenCalledWith({ _id: "m1" }, expect.objectContaining({
      $set: expect.objectContaining({ status: "LEFT", leftNote: "Transferred" }),
      $push: { endedAssignments: { $each: [{ grade: "Grade 3", assignmentType: "CLASS_TEACHER" }] } },
    }));
    // The account itself is never touched, so other schools keep working.
    expect(Teacher.updateOne).not.toHaveBeenCalled();
  });

  it("returns 404 for a teacher who never worked at this school", async () => {
    Teacher.findById.mockReturnValue(lean({ _id: TEACHER_ID, name: "Sita" }));
    TeacherMembership.findOne.mockReturnValue(lean(null));

    const res = await setStatus(json({ status: "LEFT" }), context());

    expect(res.status).toBe(404);
    expect(TeacherMembership.updateOne).not.toHaveBeenCalled();
  });

  it("rejoins a teacher who left, clearing the leaving date", async () => {
    teacherAtSchool("LEFT");

    const res = await setStatus(json({ status: "ACTIVE" }), context());

    expect(res.status).toBe(200);
    expect(TeacherMembership.updateOne).toHaveBeenCalledWith({ _id: "m1" }, {
      $set: expect.objectContaining({ status: "ACTIVE", leftAt: null }),
    });
  });

  it("refuses a password reset when the teacher also works at another school", async () => {
    teacherAtSchool("ACTIVE");
    TeacherMembership.exists.mockResolvedValue({ _id: "other" });

    const res = await resetPassword(json({}), context());

    expect(res.status).toBe(403);
    expect(Teacher.updateOne).not.toHaveBeenCalled();
  });

  it("adds an existing Pravyo teacher to a second school without a new account", async () => {
    Teacher.findOne.mockReturnValue(lean({ _id: TEACHER_ID, name: "Sita" }));
    TeacherMembership.findOne.mockReturnValue(lean(null));

    const res = await register(json({ mode: "existing", identifier: "Sita@Example.com", designation: "Science" }));

    expect(res.status).toBe(201);
    expect(Teacher.create).not.toHaveBeenCalled();
    expect(TeacherMembership.create).toHaveBeenCalledWith(expect.objectContaining({
      teacher: TEACHER_ID, school: "school-a", status: "ACTIVE", designation: "Science",
    }));
  });
});
