/**
 * CAS result domain. Pure functions — no database, no React, no imports.
 *
 * Deliberately dependency-free so it can be exercised directly by the test
 * runner and reused verbatim by the Pravyo parent dashboard, which has its own
 * module resolution. Every rule here is enforced server-side; the UI mirrors
 * some of it for immediate feedback but is never the authority — a crafted
 * request must hit the same arithmetic a teacher's click does.
 */

/** A regular result below this sends the outcome back for reassessment. */
export const REASSESSMENT_THRESHOLD = 3;

export function isValidLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= 4;
}

/**
 * The accepted achievement for one outcome.
 *
 *   acceptedLevel = MAX(level across all recorded attempts)
 *
 * Equivalent to the spec's MAX(previousAccepted, reassessment) applied
 * left to right, but stated over the whole history so it cannot drift out of
 * step with the stored attempts. The consequence the school cares about: a
 * reassessment can only ever raise a student's accepted result, never lower
 * it. A student who scored 3 and then 2 on a bad day keeps the 3.
 *
 * Returns null when nothing has been assessed. Null is NOT zero — see
 * subjectResult() for why that distinction drives the whole report.
 */
export function getAcceptedLevel(attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  if (list.length === 0) return null;

  let accepted = null;
  for (const attempt of list) {
    if (!isValidLevel(attempt?.level)) {
      throw new Error('Assessment attempt carries an invalid achievement level');
    }
    if (accepted === null || attempt.level > accepted) accepted = attempt.level;
  }
  return accepted;
}

/** Which attempt the accepted level came from (1-based). Null if unassessed. */
export function getAcceptedAttemptNumber(attempts) {
  const accepted = getAcceptedLevel(attempts);
  if (accepted === null) return null;
  const index = attempts.findIndex((a) => a.level === accepted);
  return attempts[index]?.attemptNumber ?? index + 1;
}

/**
 * Does this outcome still need a reassessment?
 *
 * The product rule: a REGULAR result below 3 (so 1 or 2) sends the student back
 * for reassessment of the same outcome. Once the accepted level reaches 3 the
 * requirement is satisfied — further attempts are optional.
 */
export function needsReassessment(attempts) {
  const accepted = getAcceptedLevel(attempts);
  if (accepted === null) return false;
  return accepted < REASSESSMENT_THRESHOLD;
}

/**
 * A result at or below this may be reassessed after extra support. Unlike
 * REASSESSMENT_THRESHOLD this is an option, not a requirement: a 3 can be
 * retried, a 4 cannot.
 */
export const REASSESSMENT_ALLOWED_MAX = 3;

/** May another reassessment be recorded on this history? */
export function canReassess(attempts) {
  const accepted = getAcceptedLevel(attempts);
  return accepted !== null && accepted <= REASSESSMENT_ALLOWED_MAX;
}

/**
 * The best score so far. Some screens use this as advisory UI guidance, but a
 * lower later reassessment may still be stored; acceptedLevel is what prevents
 * the student's total from going backwards.
 */
export function minimumReassessmentLevel(attempts) {
  return getAcceptedLevel(attempts);
}

/** Nothing recorded yet — distinct from "recorded and low". */
export function isUnassessed(attempts) {
  return getAcceptedLevel(attempts) === null;
}

/**
 * Achievement for a set of outcomes, from ACCEPTED levels only.
 *
 * Unassessed outcomes are EXCLUDED from achievement rather than counted as
 * zero. Treating "not yet assessed" as a zero would punish a class the teacher
 * simply has not reached yet, and would make mid-period reports read as
 * failure. How much of the subject has been covered is reported separately, as
 * `coverage`, so the two questions stay readable apart:
 *
 *   achievement — how well did the student do on what was assessed?
 *   coverage    — how much of the subject has been assessed at all?
 *
 * Worked example from the spec: accepted 4, 3, 2 over three outcomes
 *   sum = 9, maximum = 3 x 4 = 12, achievement = 9/12 x 100 = 75%
 */
export function subjectResult({ subjectCode, outcomes, attemptsByOutcome }) {
  const expected = Array.isArray(outcomes) ? outcomes : [];
  const accepted = [];
  let pendingReassessment = 0;

  for (const outcome of expected) {
    const attempts = attemptsByOutcome?.[outcome.code] || [];
    const level = getAcceptedLevel(attempts);
    if (level === null) continue;
    accepted.push(level);
    if (level < REASSESSMENT_THRESHOLD) pendingReassessment += 1;
  }

  const assessedCount = accepted.length;
  const outcomeCount = expected.length;
  const sum = accepted.reduce((total, level) => total + level, 0);
  const maximum = assessedCount * 4;

  return {
    subjectCode,
    outcomeCount,
    assessedCount,
    // Null, not 0, when nothing is assessed — there is no achievement to report.
    achievement: assessedCount > 0 ? round2((sum / maximum) * 100) : null,
    averageLevel: assessedCount > 0 ? round2(sum / assessedCount) : null,
    coverage: outcomeCount > 0 ? round2((assessedCount / outcomeCount) * 100) : 0,
    pendingReassessment,
    fullyAssessed: outcomeCount > 0 && assessedCount === outcomeCount,
  };
}

/** Consolidated figures across every subject in a report. */
export function consolidate(subjectResults) {
  const scored = subjectResults.filter((s) => s.achievement !== null);
  const outcomeCount = subjectResults.reduce((t, s) => t + s.outcomeCount, 0);
  const assessedCount = subjectResults.reduce((t, s) => t + s.assessedCount, 0);

  return {
    subjectCount: subjectResults.length,
    outcomeCount,
    assessedCount,
    // Weighted by assessed outcomes, so a subject with 20 outcomes does not
    // count the same as one with 2.
    achievement:
      assessedCount > 0
        ? round2(
            subjectResults.reduce(
              (total, s) => total + (s.achievement ?? 0) * s.assessedCount,
              0,
            ) / assessedCount,
          )
        : null,
    coverage: outcomeCount > 0 ? round2((assessedCount / outcomeCount) * 100) : 0,
    pendingReassessment: subjectResults.reduce(
      (t, s) => t + s.pendingReassessment,
      0,
    ),
    fullyAssessed: scored.length > 0 && subjectResults.every((s) => s.fullyAssessed),
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
