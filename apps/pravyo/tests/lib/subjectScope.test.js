import { isExamined, studentTakesSubject } from "@pravyo/core/subjectScope";

const science = { _id: "s1", kind: "COMPULSORY", sections: [] };
const computer = { _id: "c1", kind: "OPTIONAL", optionalGroup: "Optional I", sections: [] };
const accounts = { _id: "a1", kind: "OPTIONAL", optionalGroup: "Optional I", sections: [] };
const sectionAOnly = { _id: "x1", kind: "COMPULSORY", sections: ["A"] };

describe("which subjects a student takes", () => {
  it("treats subjects saved before the register existed as compulsory for everyone", () => {
    expect(studentTakesSubject({ _id: "old" }, { section: "B" })).toBe(true);
    expect(isExamined({ _id: "old" })).toBe(true);
  });

  it("gives an optional subject only to students the school assigned it to", () => {
    const ram = { section: "A", subjectChoices: ["c1"] };
    expect(studentTakesSubject(computer, ram)).toBe(true);
    expect(studentTakesSubject(accounts, ram)).toBe(false);
    expect(studentTakesSubject(science, ram)).toBe(true);
  });

  it("limits a section subject to that section (case-insensitive)", () => {
    expect(studentTakesSubject(sectionAOnly, { section: "a" })).toBe(true);
    expect(studentTakesSubject(sectionAOnly, { section: "B" })).toBe(false);
    expect(studentTakesSubject(sectionAOnly, { section: "" })).toBe(false);
  });

  it("only reports a subject as examined unless it is switched off", () => {
    expect(isExamined({ examined: false })).toBe(false);
    expect(isExamined({ examined: true })).toBe(true);
  });
});
