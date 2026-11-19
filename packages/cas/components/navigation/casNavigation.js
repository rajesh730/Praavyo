import { ClipboardCheck as FaClipboardCheck, BookOpen as FaBookOpen, FileText as FaFileAlt, FolderOpen as FaFolderOpen, LineChart as FaChartLine, CalendarDays as FaCalendarAlt, CalendarCheck as FaCalendarCheck } from 'lucide-react';

/**
 * CAS navigation - the school-facing assessment workflow.
 *
 * Everything here is something a school does: set up a curriculum, record an
 * assessment, review progress, and publish final student results. The student
 * roster and school profile stay in Pravyo and are read live from there.
 */
export const CAS_NAV_LINKS = [
  { name: 'Assessment', href: '/school/cas/assessment', icon: FaClipboardCheck, initials: 'CA' },
  { name: 'Student Progress', href: '/school/cas/student-progress', icon: FaChartLine, initials: 'SP' },
  { name: 'Curriculum', href: '/school/cas/curriculum', icon: FaBookOpen, initials: 'CU' },
  { name: 'Manage Exams', href: '/school/cas/exams', icon: FaCalendarAlt, initials: 'EX' },
  { name: 'Student Result', href: '/school/cas/student-result', icon: FaFileAlt, initials: 'SR' },
  { name: 'Published Results', href: '/school/cas/published-results', icon: FaFolderOpen, initials: 'PR' },
];


/**
 * Internal exam navigation — the school's own written exams, Grades 1-10.
 * Shares the CAS shell; CAS and Internal Exam link to each other at the end.
 */
export const INTERNAL_EXAM_NAV_LINKS = [
  { name: 'Mark Entry', href: '/school/internal-exam/marks', icon: FaClipboardCheck, initials: 'ME' },
  // Attendance and extra activities live here, not in CAS: they print on the
  // internal exam's report card only. School admin only (see CasLayout).
  { name: 'Attendance & Activities', href: '/school/internal-exam/attendance', icon: FaCalendarCheck, initials: 'AA' },
  { name: 'Manage Exams', href: '/school/internal-exam/exams', icon: FaCalendarAlt, initials: 'EX' },
  { name: 'Results', href: '/school/internal-exam/results', icon: FaFileAlt, initials: 'RS' },
  // Published cards only, like CAS's Published Results.
  { name: 'Published Results', href: '/school/internal-exam/published-results', icon: FaFolderOpen, initials: 'PR' },
  { name: 'CAS (Grades 1–5)', href: '/school/cas/assessment', icon: FaFolderOpen, initials: 'CA' },
];

export const CAS_TO_INTERNAL_LINK = { name: 'Internal Exam', href: '/school/internal-exam/marks', icon: FaCalendarAlt, initials: 'IE' };

/**
 * The teacher's exam workspaces, on the teacher's own URLs and API
 * (/teacher/exams/..., /api/teacher/exams/...). A teacher never opens the
 * school's /school/... screens; the school assigns them grades and subjects.
 *
 * Laid out like the school's: each workspace has its own menu, and its last
 * link switches to the other workspace (CAS <-> Internal Exam).
 */
export const TEACHER_CAS_NAV_LINKS = [
  { name: 'Assessment', href: '/teacher/exams/cas', icon: FaClipboardCheck, initials: 'CA' },
  { name: 'Student Progress', href: '/teacher/exams/cas/progress', icon: FaChartLine, initials: 'SP' },
  { name: 'Internal Exam', href: '/teacher/exams/internal', icon: FaCalendarAlt, initials: 'IE' },
];

export const TEACHER_INTERNAL_NAV_LINKS = [
  { name: 'Mark Entry', href: '/teacher/exams/internal', icon: FaClipboardCheck, initials: 'ME' },
  { name: 'CAS (Grades 1–5)', href: '/teacher/exams/cas', icon: FaFolderOpen, initials: 'CA' },
];

/**
 * Is `link` the current screen? A link also covers the pages below it, unless
 * another link in the same menu is a closer match (so on
 * /teacher/exams/cas/progress, "Student Progress" is active, not "CAS Marks").
 */
export function isCasLinkActive(link, pathname, links = []) {
  if (link.href === '/') return pathname === '/';
  if (pathname === link.href) return true;
  if (!pathname?.startsWith(`${link.href}/`)) return false;
  return !links.some((other) => other.href !== link.href
    && other.href.startsWith(`${link.href}/`)
    && (pathname === other.href || pathname.startsWith(`${other.href}/`)));
}
