import { ClipboardCheck as FaClipboardCheck, BookOpen as FaBookOpen, FileText as FaFileAlt, FolderOpen as FaFolderOpen, LineChart as FaChartLine, CalendarDays as FaCalendarAlt } from 'lucide-react';

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
  { name: 'Manage Exams', href: '/school/internal-exam/exams', icon: FaCalendarAlt, initials: 'EX' },
  { name: 'Results', href: '/school/internal-exam/results', icon: FaFileAlt, initials: 'RS' },
  { name: 'CAS (Grades 1–5)', href: '/school/cas/assessment', icon: FaFolderOpen, initials: 'CA' },
];

export const CAS_TO_INTERNAL_LINK = { name: 'Internal Exam', href: '/school/internal-exam/marks', icon: FaCalendarAlt, initials: 'IE' };
