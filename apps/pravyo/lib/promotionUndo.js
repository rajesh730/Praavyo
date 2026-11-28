/**
 * Undoing a whole-school promotion ("Promote year" pressed by mistake).
 *
 * The promotion saves each student's exact state from just before it changed
 * them (a PromotionRun). Undo puts that state back, but only for students
 * still exactly as the promotion left them: anyone edited since (roll number
 * changed, transferred, corrected one by one) is skipped and listed, so undo
 * never overwrites work done after the promotion.
 *
 * Pure helpers; the route does the database work.
 */

/** How long after a promotion it can be undone in one step. */
export const UNDO_WINDOW_DAYS = 30;

const plainEnrollments = (enrollments = []) =>
  (enrollments || []).map((entry) => (typeof entry?.toObject === "function" ? entry.toObject() : { ...entry }));

/** The fields a promotion changes, as they are now. */
export function studentState(student) {
  return {
    grade: student.grade || "",
    section: student.section || "",
    rollNumber: student.rollNumber || "",
    status: student.status || "ACTIVE",
    statusChangedAt: student.statusChangedAt || null,
    statusChangedBy: student.statusChangedBy || null,
    statusReason: student.statusReason || "",
    enrollments: plainEnrollments(student.enrollments),
  };
}

/** A short fingerprint of the state, to tell whether a student changed since. */
export function stateFingerprint(state) {
  return JSON.stringify({
    grade: state.grade || "",
    section: state.section || "",
    rollNumber: String(state.rollNumber || ""),
    status: state.status || "",
    enrollments: (state.enrollments || []).length,
    lastEnrollment: (() => {
      const last = (state.enrollments || []).at(-1);
      return last ? `${last.grade}|${last.status}|${last.academicYearStart ?? ""}` : "";
    })(),
  });
}

/**
 * Whether the run can be undone now. `run` is the PromotionRun, `years` the
 * current { from, to } AcademicYear rows, `newYearRecords` how many exams or
 * assessments already belong to the new year.
 */
export function undoBlocker({ run, years, newYearRecords = 0, now = new Date() }) {
  if (!run) return "There is no promotion to undo.";
  if (run.status !== "COMPLETED") return "This promotion has already been undone.";
  const ageDays = (now.getTime() - new Date(run.createdAt).getTime()) / 86_400_000;
  if (ageDays > UNDO_WINDOW_DAYS) {
    return `A promotion can be undone within ${UNDO_WINDOW_DAYS} days. Correct students one by one instead.`;
  }
  if (!years?.to || years.to.status !== "ACTIVE") return "The new school year is no longer the current one.";
  if (!years?.from || years.from.status !== "CLOSED") return "The previous school year is not closed any more.";
  if (newYearRecords > 0) {
    return "Exams or assessments have already been recorded in the new year, so the whole promotion cannot be undone. Correct students one by one instead.";
  }
  return "";
}
