import { Bell as FaBell, BookOpen as FaBookOpen, Megaphone as FaBullhorn, Target as FaBullseye, CalendarDays as FaCalendarAlt, Presentation as FaChalkboardTeacher, PieChart as FaChartPie, CircleCheck as FaCheckCircle, ClipboardCheck as FaClipboardCheck, BadgeCheck as FaCertificate, Settings as FaCog, MessageSquareText as FaCommentDots, Feather as FaFeatherAlt, ArrowLeftRight as FaExchangeAlt, Globe as FaGlobe, GraduationCap as FaGraduationCap, HeartPulse as FaHeartbeat, History as FaHistory, House as FaHome, School as FaSchool, Trophy as FaTrophy, Users as FaUsers, ShieldUser as FaUserShield, LayoutGrid as FaThLarge, Inbox as FaInbox, KeyRound, UserRound } from "lucide-react";

export const PUBLIC_NAV_LINKS = [
  { label: "Home", href: "/", key: "home", icon: FaHome },
  { label: "Schools", href: "/schools", key: "schools", icon: FaSchool },
  { label: "Events", href: "/events", key: "events", icon: FaCalendarAlt },
  { label: "Trainings", href: "/trainings", key: "trainings", icon: FaChalkboardTeacher },
  { label: "Winners", href: "/winners", key: "winners", icon: FaTrophy },
];

export const ADMIN_NAV_LINKS = [
  { name: "Approvals", href: "/admin/dashboard?tab=approvals", icon: FaCheckCircle },
  { name: "Schools", href: "/admin/dashboard?tab=schools", icon: FaSchool },
  { name: "Platform Events", href: "/admin/dashboard?tab=events", icon: FaCalendarAlt },
  { name: "Notices", href: "/admin/dashboard?tab=notices", icon: FaBullhorn },
  { name: "School Spotlight", href: "/admin/dashboard?tab=spotlight", icon: FaBullseye },
  { name: "Theme Library", href: "/admin/theme-library", icon: FaBookOpen },
  { name: "Diagnostics", href: "/admin/diagnostics", icon: FaHeartbeat },
  { name: "Feedback", href: "/admin/feedback", icon: FaCommentDots },
  { name: "Settings", href: "/admin/settings", icon: FaCog },
];

export const SCHOOL_NAV_LINKS = [
  { name: "Overview", href: "/school/dashboard", icon: FaChartPie },
  { name: "Students", href: "/school/dashboard?tab=students", icon: FaUsers },
  { name: "Manage Sections", href: "/school/dashboard?tab=sections", icon: FaThLarge },
  { name: "Manage Subjects", href: "/school/dashboard?tab=subjects", icon: FaBookOpen },
  { name: "Student Transfer", href: "/school/dashboard?tab=student-transfers", icon: FaExchangeAlt },
  // Exams: a chooser between CAS (Grades 1–5, theme assessment) and the
  // Internal Exam (Grades 1–10, marks). Each opens a full-screen workspace
  // that REPLACES the Pravyo chrome, with a "Back to Pravyo" link to return.
  { name: "Exams", href: "/school/exams", icon: FaClipboardCheck },
  // Guardian access to the Parent App is authorised here — see §19/§27 in
  // docs/PARENT_APP.md. Its own page rather than a dashboard tab, because
  // safeguarding decisions deserve a stable URL an admin can be sent to.
  { name: "Parents & Guardians", href: "/school/guardians", icon: FaUserShield },
  // The staff side of parent messaging. Without it parents can write and
  // nobody reads, which is worse than having no messaging at all.
  { name: "Parent Messages", href: "/school/messages", icon: FaCommentDots },
  // Questions from visitors on the school's public page (not signed in).
  { name: "Inquiries", href: "/school/dashboard?tab=inquiries", icon: FaInbox },
  { name: "Teachers", href: "/school/dashboard?tab=teachers", icon: FaChalkboardTeacher },
  { name: "School Events", href: "/school/dashboard?tab=school-events", icon: FaCalendarAlt },
  { name: "Platform Events", href: "/school/dashboard?tab=platform-events", icon: FaGlobe },
  { name: "Student Notices", href: "/school/dashboard?tab=student-notices", icon: FaBell },
  { name: "Received Notices", href: "/school/dashboard?tab=notices", icon: FaBell },
  { name: "Publishing Desk", href: "/school/dashboard?tab=magazine", icon: FaBookOpen },
  { name: "Certificates", href: "/school/certificates", icon: FaCertificate },
  { name: "Public Profile", href: "/school/dashboard?tab=showcase", icon: FaSchool },
  { name: "Feedback", href: "/school/dashboard?tab=feedback", icon: FaCommentDots },
  { name: "Settings", href: "/school/dashboard?tab=settings", icon: FaCog },
  { name: "History", href: "/school/dashboard?tab=history", icon: FaHistory },
];

// One workspace, split into tabs. The first four also fill the phone tab bar,
// so they are the daily ones; Events and Profile live under "Menu".
export const TEACHER_NAV_LINKS = [
  { name: "Overview", href: "/teacher/dashboard", icon: FaChalkboardTeacher },
  // Exams: a chooser between CAS and the Internal Exam, as on the school
  // dashboard. Each opens the teacher's exam workspace (/teacher/exams/...).
  { name: "Exams", href: "/teacher/dashboard?tab=exams", icon: FaClipboardCheck },
  { name: "Students", href: "/teacher/dashboard?tab=students", icon: FaUsers },
  { name: "Events", href: "/teacher/dashboard?tab=events", icon: FaCalendarAlt },
  // Class teachers manage their grade's Free Writing (others see why not).
  { name: "Publishing Desk", href: "/teacher/dashboard?tab=publishing", icon: FaBookOpen },
  // The current school's School Wall, the same posts its students read.
  { name: "School Wall", href: "/teacher/school-wall", icon: FaSchool },
  { name: "My Profile", href: "/teacher/dashboard?tab=profile", icon: UserRound },
];

export const STUDENT_NAV_LINKS = [
  { name: "My Result", href: "/student/learning/cas", icon: FaGraduationCap },
  { name: "My Activity", href: "/student/dashboard", icon: FaSchool },
  { name: "Events", href: "/student/events", icon: FaCalendarAlt },
  { name: "Notices", href: "/student/notices", icon: FaBell },
  { name: "My Writing", href: "/student/writing", icon: FaFeatherAlt },
  { name: "My Journey", href: "/student/journey", icon: FaGraduationCap },
  { name: "School Wall", href: "/student/school-wall", icon: FaSchool },
  { name: "School Magazine", href: "/student/magazine", icon: FaBookOpen },
  { name: "Feedback", href: "/student/feedback", icon: FaCommentDots },
  { name: "Change Password", href: "/student/account", icon: KeyRound },
];

export const STUDENT_QUICK_NAV_LINKS = STUDENT_NAV_LINKS.filter((link) =>
  ["/student/learning/cas", "/student/school-wall", "/student/magazine", "/student/writing", "/student/events"].includes(
    link.href
  )
).map((link) => ({
  label: link.name === "School Magazine" ? "Magazine" : link.name,
  href: link.href,
  match: link.href,
  icon: link.icon,
}));

export function getRoleNavigationLinks(role) {
  if (role === "SUPER_ADMIN") return ADMIN_NAV_LINKS;
  if (role === "SCHOOL_ADMIN") return SCHOOL_NAV_LINKS;
  if (role === "TEACHER") return TEACHER_NAV_LINKS;
  if (role === "STUDENT") return STUDENT_NAV_LINKS;
  return [];
}

/**
 * Whether a navigation link is the current page. Exact match on path plus
 * `?tab=`, or any nested route under a plain (tab-less) link.
 */
export function isNavLinkActive(link, pathname, currentTab) {
  const currentHref = (pathname || "") + (currentTab ? `?tab=${currentTab}` : "");
  const isNestedActive = !link.href.includes("?") && Boolean(pathname?.startsWith(`${link.href}/`));
  return link.href === currentHref || isNestedActive;
}
