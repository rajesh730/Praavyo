jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { exists: jest.fn(), find: jest.fn() },
}));

import Student from "@/models/Student";
import { isGradeAllowed, isWritingInGrades, validateWritingEdit } from "@/lib/freeWritingDesk";

describe("class teacher grade scope", () => {
  it("accepts the class grade in any spelling", () => {
    expect(isGradeAllowed("Grade 3", ["Grade 3"])).toBe(true);
    expect(isGradeAllowed("3", ["Grade 3"])).toBe(true);
    expect(isGradeAllowed("grade 3", ["3"])).toBe(true);
  });

  it("refuses other grades", () => {
    expect(isGradeAllowed("Grade 4", ["Grade 3"])).toBe(false);
    expect(isGradeAllowed("Grade 10", ["Grade 1"])).toBe(false);
    expect(isGradeAllowed("Grade 3", [])).toBe(false);
  });
});

describe("validateWritingEdit", () => {
  const article = { title: "Old", content: "Old text", category: "POEM", tags: [] };

  it("returns the changes for a valid edit", () => {
    const { error, changes } = validateWritingEdit({ title: " New ", content: "New text" }, article);
    expect(error).toBeUndefined();
    expect(changes.title).toBe("New");
    expect(changes.content).toBe("New text");
    expect(changes.schoolEditedAt).toBeInstanceOf(Date);
  });

  it("refuses an empty title or text", () => {
    expect(validateWritingEdit({ title: " " }, article).error).toMatch(/title/);
    expect(validateWritingEdit({ content: "" }, article).error).toMatch(/empty/);
  });
});

describe("writing belongs to the grade it was written in", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses the grade stamped on the writing, not the author's grade today", async () => {
    // Written in Grade 3, author since promoted to Grade 4.
    const article = { authorGrade: "Grade 3", authorStudent: "student-1" };
    await expect(isWritingInGrades(article, ["Grade 3"], "school-1")).resolves.toBe(true);
    await expect(isWritingInGrades(article, ["Grade 4"], "school-1")).resolves.toBe(false);
    expect(Student.exists).not.toHaveBeenCalled();
  });

  it("falls back to the author's current grade for writing without the stamp", async () => {
    Student.exists.mockResolvedValue({ _id: "student-1" });
    await expect(isWritingInGrades({ authorGrade: "", authorStudent: "student-1" }, ["Grade 3"], "school-1")).resolves.toBe(true);
    expect(Student.exists).toHaveBeenCalledWith(expect.objectContaining({ _id: "student-1", school: "school-1" }));
  });

  it("refuses when the teacher has no class grade", async () => {
    await expect(isWritingInGrades({ authorGrade: "Grade 3" }, [], "school-1")).resolves.toBe(false);
  });
});
