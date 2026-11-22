jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock("@pravyo/db/models/TeacherTeachingAssignment", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock("@pravyo/db/teacherMemberships", () => ({
  isActiveTeacherMember: jest.fn(),
}));

import Student from "@/models/Student";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { getTeacherMagazineSchool, getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";

const teacherSession = { user: { id: "teacher-1", schoolId: "school-1" } };

function assignmentRows(rows) {
  TeacherTeachingAssignment.find.mockReturnValue({
    select: () => ({ lean: async () => rows }),
  });
}

describe("teacher magazine content boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isActiveTeacherMember.mockResolvedValue(true);
  });

  it("resolves students only from the teacher's own class grades", async () => {
    assignmentRows([{ grade: "Grade 3" }, { grade: "Grade 3" }]);
    Student.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(["student-3"]) });

    const scope = await getTeacherMagazineScope(teacherSession);

    expect(scope.school).toBe("school-1");
    expect(scope.grades).toEqual(["Grade 3"]);
    // Writing counts for the grade it was written in; older writing without
    // that snapshot falls back to the author's current grade.
    expect(scope.writingFilter.$or[0]).toEqual({
      authorGrade: { $in: expect.arrayContaining(["Grade 3", "3"]) },
    });
    expect(scope.writingFilter.$or[1]).toEqual({
      authorGrade: { $in: [null, ""] },
      authorStudent: { $in: ["student-3"] },
    });
    expect(Student.find).toHaveBeenCalledWith(expect.objectContaining({
      school: "school-1",
      grade: expect.objectContaining({ $in: expect.arrayContaining(["Grade 3", "3"]) }),
    }));
  });

  it("lets an active teacher read the final school magazine without requiring a class assignment", async () => {
    await expect(getTeacherMagazineSchool(teacherSession)).resolves.toBe("school-1");
    expect(TeacherTeachingAssignment.find).not.toHaveBeenCalled();
  });

  it("rejects a subject teacher with no class-teacher assignment", async () => {
    assignmentRows([]);
    await expect(getTeacherMagazineScope(teacherSession)).rejects.toMatchObject({ code: "NOT_CLASS_TEACHER", status: 403 });
    expect(Student.find).not.toHaveBeenCalled();
  });

  it("rejects a teacher whose school membership is no longer active", async () => {
    isActiveTeacherMember.mockResolvedValue(false);
    await expect(getTeacherMagazineScope(teacherSession)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(TeacherTeachingAssignment.find).not.toHaveBeenCalled();
  });
});
