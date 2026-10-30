/**
 * The platform's default theme library.
 *
 * It is stored with the ordinary CAS curriculum collections (CasSubject,
 * CasLearningOutcome) under one fixed, reserved "school" id that belongs to no
 * real school. That lets the super admin edit it with the same Curriculum
 * editor schools use, and lets schools copy from it with plain queries.
 *
 * Schools never read it directly for assessment: they copy themes into their
 * own subjects and edit their copies. Grades 1–5 only; Grades 6–10 follow a
 * different system and are not part of the library.
 */
export const LIBRARY_SCHOOL_ID = "000000000000000000000d1b";

export const LIBRARY_GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"];

export function isLibrarySchool(id) {
  return String(id || "") === LIBRARY_SCHOOL_ID;
}

/** "Grade 3", "grade 3" and "3" are the same grade. */
export function gradeNumber(grade) {
  const match = String(grade || "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function sameGrade(a, b) {
  const left = gradeNumber(a);
  return left !== null ? left === gradeNumber(b) : String(a).trim() === String(b).trim();
}
