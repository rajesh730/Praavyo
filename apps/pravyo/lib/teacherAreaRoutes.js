/**
 * Where a TEACHER may go in the /school area, and where they are sent instead.
 *
 * The /school area belongs to the school admin. Teachers have their own area:
 * the teacher dashboard, and their exam workspace on /teacher/exams/... (which
 * talks to the teacher API, /api/teacher/exams/...). The routing gate
 * (proxy.js) and the school layouts both use this one list, so the rule cannot
 * drift between them.
 *
 * Two /school pages are shared with teachers on purpose:
 *   - /school/events/<id>/manage  an event the school assigned them to run
 *   - /school/messages            parent messages routed to them
 * Each re-checks the teacher's access in its own API.
 */
export const TEACHER_SHARED_SCHOOL_PAGES = ['/school/events', '/school/messages'];

// Old /school exam addresses a teacher may still have bookmarked, and the
// teacher-area page that replaced each.
const MOVED_TO_TEACHER_AREA = [
  ['/school/cas/student-progress', '/teacher/exams/cas/progress'],
  ['/school/cas/assessment', '/teacher/exams/cas'],
  ['/school/cas', '/teacher/exams/cas'],
  ['/school/internal-exam', '/teacher/exams/internal'],
  ['/school/exams', '/teacher/dashboard?tab=exams'],
];

const within = (pathname, base) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * For a teacher opening `pathname` under /school: null when they may stay,
 * otherwise the teacher-area address to send them to.
 */
export function teacherRedirectForSchoolPath(pathname) {
  if (!pathname || !within(pathname, '/school')) return null;
  if (TEACHER_SHARED_SCHOOL_PAGES.some((page) => within(pathname, page))) return null;
  const moved = MOVED_TO_TEACHER_AREA.find(([from]) => within(pathname, from));
  return moved ? moved[1] : '/teacher/dashboard';
}
