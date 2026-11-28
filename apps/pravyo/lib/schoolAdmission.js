import User from "@/models/User";
import SchoolConfig from "@/models/SchoolConfig";
import SchoolAdmission from "@/models/SchoolAdmission";
import { buildGradeLabels } from "@/lib/schoolGrades";

/**
 * A school's admission season (Settings → Admission): open or closed, which
 * grades take applications, the academic year, last date and instructions.
 * Read by the public profile, the Website API and the inquiry intake, so all
 * three agree on whether the form is offered.
 */

export const ADMISSION_NOTE_MAX = 1500;
export const ADMISSION_YEAR_MAX = 40;

/** The grades the school runs: its configured list, else the registration range. */
export async function loadSchoolGrades(schoolId) {
  const [config, user] = await Promise.all([
    SchoolConfig.findOne({ school: schoolId }).select("grades").lean(),
    User.findById(schoolId).select("schoolConfig").lean(),
  ]);
  if (Array.isArray(config?.grades) && config.grades.length) return config.grades.map(String);
  return buildGradeLabels(user?.schoolConfig || {});
}

/**
 * The season as everyone outside Settings sees it. `grades` is the list
 * taking applications: the school's choice, kept to grades it still runs, or
 * every grade when it chose none.
 */
export function serializeAdmission(row, schoolGrades = []) {
  const chosen = (row?.grades || []).filter((grade) => schoolGrades.includes(grade));
  return {
    isOpen: Boolean(row?.isOpen),
    academicYear: row?.academicYear || "",
    grades: chosen.length ? chosen : [...schoolGrades],
    deadline: row?.deadline || null,
    note: row?.note || "",
    openedAt: row?.openedAt || null,
  };
}

/** The school's season, ready for a form: `{ season, schoolGrades }`. */
export async function getAdmissionSeason(schoolId) {
  const [row, schoolGrades] = await Promise.all([
    SchoolAdmission.findOne({ school: schoolId }).lean(),
    loadSchoolGrades(schoolId),
  ]);
  return { row, schoolGrades, season: serializeAdmission(row, schoolGrades) };
}

/**
 * Validate what Settings → Admission saves. Returns `{ data }` or `{ error }`.
 * Grades outside the school's own list are refused rather than dropped, so a
 * school never believes a grade is open when it is not.
 */
export function parseAdmissionSettings(body, schoolGrades = []) {
  if (!body || typeof body !== "object") return { error: "Nothing to save." };
  const isOpen = body.isOpen === true;
  const academicYear = String(body.academicYear ?? "").replace(/\s+/g, " ").trim();
  if (academicYear.length > ADMISSION_YEAR_MAX) return { error: "The academic year is too long." };

  const grades = Array.isArray(body.grades)
    ? [...new Set(body.grades.map((grade) => String(grade || "").trim()).filter(Boolean))]
    : [];
  const unknown = grades.filter((grade) => !schoolGrades.includes(grade));
  if (unknown.length) return { error: `${unknown.join(", ")} is not a grade at your school.` };

  let deadline = null;
  if (body.deadline) {
    const parsed = new Date(body.deadline);
    if (Number.isNaN(parsed.getTime())) return { error: "Enter a valid last date." };
    deadline = parsed;
  }

  const note = String(body.note ?? "").trim();
  if (note.length > ADMISSION_NOTE_MAX) return { error: `Keep the instructions under ${ADMISSION_NOTE_MAX} characters.` };

  return { data: { isOpen, academicYear, grades, deadline, note } };
}
