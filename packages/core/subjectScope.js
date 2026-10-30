/**
 * Which subjects a student takes — the one rule shared by CAS and Pravyo.
 *
 * A subject of the student's grade applies when:
 *   - it is offered to the student's section (no sections listed = every
 *     section), and
 *   - it is compulsory, or it is an optional subject the school assigned to
 *     this student (`student.subjectChoices`).
 *
 * Subject rows created before these fields existed have none of them set and
 * therefore read as compulsory for every section — exactly the old behaviour.
 */

const sameText = (a, b) =>
  String(a || "").trim().toLocaleLowerCase() === String(b || "").trim().toLocaleLowerCase();

export function subjectId(subject) {
  return String(subject?._id || subject?.id || "");
}

export function offeredToSection(subject, section) {
  const sections = Array.isArray(subject?.sections) ? subject.sections.filter(Boolean) : [];
  return sections.length === 0 || sections.some((name) => sameText(name, section));
}

export function studentTakesSubject(subject, student) {
  if (!offeredToSection(subject, student?.section)) return false;
  if (subject?.kind !== "OPTIONAL") return true;
  const chosen = (student?.subjectChoices || []).map(String);
  return chosen.includes(subjectId(subject));
}

/** Rows that read as examined (missing flag = examined, the old default). */
export function isExamined(subject) {
  return subject?.examined !== false;
}

/** Mongo filter for examined subjects, tolerant of rows without the flag. */
export const EXAMINED_FILTER = { examined: { $ne: false } };
