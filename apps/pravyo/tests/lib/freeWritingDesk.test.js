import { isGradeAllowed, validateWritingEdit } from "@/lib/freeWritingDesk";

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
