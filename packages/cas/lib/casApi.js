/**
 * Which assessment API a screen talks to.
 *
 * The same screens (assessment book, internal-exam mark ledger, student
 * progress) serve two audiences:
 *   - 'school'  -> the school's API  /api/cas/...
 *   - 'teacher' -> the teacher's API /api/teacher/exams/...
 *
 * Both APIs run the same endpoint definitions (apps/pravyo/lib/exams/), so the
 * data is identical; only the door differs, and each door admits only its own
 * audience. CasLayout picks the audience and screens read `useCas().api`.
 */
const BASES = {
  school: { cas: '/api/cas', internal: '/api/cas/internal-exams' },
  teacher: { cas: '/api/teacher/exams/cas', internal: '/api/teacher/exams/internal' },
};

/** Every prefix a CAS screen may read from, for realtime refresh. */
export const CAS_API_PREFIXES = ['/api/cas/', '/api/teacher/exams/'];

export function casApiFor(audience) {
  const base = BASES[audience] || BASES.school;
  return {
    audience: BASES[audience] ? audience : 'school',
    /** A CAS path, e.g. cas('/sheet') */
    cas: (path) => `${base.cas}${path}`,
    /** An internal-exam path, e.g. internal('/sheet'); internal() is the list. */
    internal: (path = '') => `${base.internal}${path}`,
  };
}
