import {
  GRADE_CATALOG,
  catalogGrade,
  gradeRank,
  isPrimaryLevel,
  nextCatalogGrade,
  registrationGrades,
  resolveSchoolGrades,
  sortGrades,
} from "@pravyo/core/gradeLevels";
import { getEquivalentGradeValues, normalizeGradeValue } from "@/lib/schoolGrades";
import { getGradeNumber, getNextGrade, getOrderedGrades, isTopGrade } from "@/lib/academicYear";

describe("grade catalogue", () => {
  it("offers Nursery, LKG, UKG and Grade 1–12", () => {
    expect(GRADE_CATALOG.slice(0, 4)).toEqual(["Nursery", "LKG", "UKG", "Grade 1"]);
    expect(GRADE_CATALOG.at(-1)).toBe("Grade 12");
    expect(GRADE_CATALOG).toHaveLength(15);
  });

  it("reads common spellings of the pre-primary levels", () => {
    expect(catalogGrade("nursery")).toBe("Nursery");
    expect(catalogGrade("L.K.G")).toBe("LKG");
    expect(catalogGrade("upper kg")).toBe("UKG");
    expect(catalogGrade("class 9")).toBe("Grade 9");
    expect(catalogGrade("Grade 13")).toBeNull();
    expect(catalogGrade("Playgroup")).toBeNull();
  });

  it("orders Nursery before LKG before UKG before Grade 1", () => {
    expect(sortGrades(["Grade 2", "UKG", "Grade 10", "Nursery", "LKG", "grade 2"])).toEqual([
      "Nursery",
      "LKG",
      "UKG",
      "Grade 2",
      "Grade 10",
    ]);
    expect(gradeRank("Nursery")).toBe(-2);
    expect(gradeRank("UKG")).toBe(0);
  });

  it("treats Nursery to Grade 5 as primary (CAS), Grade 6 up as not", () => {
    for (const grade of ["Nursery", "LKG", "UKG", "Grade 1", "Grade 5"]) expect(isPrimaryLevel(grade)).toBe(true);
    for (const grade of ["Grade 6", "Grade 10", "Grade 12", "Playgroup", ""]) expect(isPrimaryLevel(grade)).toBe(false);
  });
});

describe("a school's grades", () => {
  const registration = { schoolLevel: { minGrade: 1, maxGrade: 10 } };

  it("start as the signup range", () => {
    expect(registrationGrades(registration)).toEqual(GRADE_CATALOG.slice(3, 13));
    expect(resolveSchoolGrades(registration, { grades: [] })).toHaveLength(10);
  });

  it("follow the school's own list once it edits them, never the signup range", () => {
    const config = { gradesCustomized: true, grades: ["Grade 1", "Nursery", "UKG", "LKG", "Grade 9"] };
    expect(resolveSchoolGrades(registration, config)).toEqual(["Nursery", "LKG", "UKG", "Grade 1", "Grade 9"]);
  });

  it("ignore a stale copy until the school has edited them", () => {
    expect(resolveSchoolGrades(registration, { gradesCustomized: false, grades: ["Nursery"] })).toHaveLength(10);
  });
});

describe("matching stored grades", () => {
  it("keeps pre-primary names and matches their spellings", () => {
    expect(normalizeGradeValue("lkg")).toBe("LKG");
    expect(normalizeGradeValue("Grade 3")).toBe("Grade 3");
    expect(getEquivalentGradeValues("Nursery")).toEqual(expect.arrayContaining(["Nursery", "nursery"]));
    expect(getEquivalentGradeValues("UKG")).toEqual(expect.arrayContaining(["UKG", "ukg", "U.K.G"]));
    expect(getEquivalentGradeValues("Grade 9")).toEqual(["Grade 9", "9"]);
  });
});

describe("promotion with pre-primary grades", () => {
  const grades = ["Nursery", "LKG", "UKG", "Grade 1", "Grade 2", "Grade 9"];

  it("moves Nursery → LKG → UKG → Grade 1", () => {
    expect(getNextGrade("Nursery", grades)).toBe("LKG");
    expect(getNextGrade("LKG", grades)).toBe("UKG");
    expect(getNextGrade("UKG", grades)).toBe("Grade 1");
    expect(nextCatalogGrade("Grade 12")).toBeNull();
  });

  it("keeps each pre-primary level its own group", () => {
    expect(getGradeNumber("Nursery")).not.toBe(getGradeNumber("LKG"));
    expect(getOrderedGrades(["Grade 1", "UKG", "Nursery"])).toEqual(["Nursery", "UKG", "Grade 1"]);
  });

  it("graduates students of the school's top grade after Grade 10 is removed", () => {
    expect(isTopGrade("Grade 9", grades)).toBe(true);
    expect(getNextGrade("Grade 9", grades)).toBeNull();
  });
});
