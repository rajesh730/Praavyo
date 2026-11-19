/**
 * Signed-in people never see the public site (owner rule, 2026-11-13,
 * tightened 2026-11-19: no public page inside the dashboard either).
 *
 * Every link a signed-in person opens is resolved here first — by the click
 * catcher in DashboardLinkProvider and by proxy.js for any public URL they
 * reach some other way (typed, bookmarked, a saved notification):
 *   - dashboard pages and `/` (the proxy sends `/` to the role's dashboard)
 *     navigate normally;
 *   - every public page — events, trainings, schools, students, writings,
 *     magazines, winners, notices, search… — goes to the SAME service inside
 *     the role's own dashboard (`dashboardHrefForPublicPath`);
 *   - certificates and certificate verification are documents, not pages of
 *     the public site: they open in the viewer on top of the dashboard,
 *     embedded (no public navigation), and `?download=pdf` saves the PDF.
 *
 * Pure functions only (no browser, no Node APIs), so the rules are testable
 * and proxy.js can share them.
 */

export const DASHBOARD_PREFIXES = ["/admin", "/school", "/teacher", "/student", "/parent"];

// Not dashboards, but not public pages either: auth screens and system
// paths keep their normal behaviour.
const PASS_THROUGH_PREFIXES = ["/api", "/_next", "/login", "/register", "/offline"];

// Documents a signed-in person may still open, inside the viewer.
const DOCUMENT_TITLES = [
  ["/certificates/bulk", "Certificates"],
  ["/certificates", "Certificate"],
  ["/verify", "Verify certificate"],
];

/** Public pages that have an in-dashboard service (see dashboardHrefForPublicPath). */
export const PUBLIC_PAGE_PREFIXES = [
  "/events",
  "/trainings",
  "/schools",
  "/students",
  "/writings",
  "/magazines",
  "/winners",
  "/notices",
  "/search",
  "/student-voices",
];

function startsWithSegment(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isDashboardPath(path = "") {
  return DASHBOARD_PREFIXES.some((prefix) => startsWithSegment(path, prefix));
}

export function isPublicPagePath(path = "") {
  return PUBLIC_PAGE_PREFIXES.some((prefix) => startsWithSegment(path, prefix));
}

export function isDocumentPath(path = "") {
  return DOCUMENT_TITLES.some(([prefix]) => startsWithSegment(path, prefix));
}

// Parent Access Card and sign-in screens live under /parent and /student but
// have no session — they are not the signed-in app.
const SIGNED_OUT_DASHBOARD_PATHS = new Set([
  "/parent/login",
  "/parent/register",
  "/parent/access",
  "/parent/activate",
  "/student/login",
]);

/** Whether this screen is part of the signed-in app (where the rule applies). */
export function isSignedInAreaPath(path = "") {
  return isDashboardPath(path) && !SIGNED_OUT_DASHBOARD_PATHS.has(path);
}

// Each role's own screens for the services the public site offers.
const ROLE_HOME = {
  SUPER_ADMIN: "/admin/dashboard",
  SCHOOL_ADMIN: "/school/dashboard",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/dashboard",
  PARENT: "/parent",
};

const ROLE_EVENTS = {
  SUPER_ADMIN: "/admin/dashboard?tab=events",
  // A notice can announce a platform event the school has not joined yet, so
  // the Platform Events list (with its Join button) is the safe landing spot.
  SCHOOL_ADMIN: "/school/dashboard?tab=platform-events",
  TEACHER: "/teacher/dashboard?tab=events",
  STUDENT: "/student/events",
  PARENT: "/parent/events",
};

// Praavyo trainings: the admin runs them and schools register in Platform
// Events → Trainings; a teacher's training certificates are on the Overview,
// a student's on My Journey, a child's on My Child.
const ROLE_TRAININGS = {
  SUPER_ADMIN: "/admin/dashboard?tab=events&kind=trainings",
  SCHOOL_ADMIN: "/school/dashboard?tab=platform-events&kind=trainings",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/journey",
  PARENT: "/parent/child",
};

const ROLE_NOTICES = {
  SUPER_ADMIN: "/admin/dashboard?tab=notices",
  SCHOOL_ADMIN: "/school/dashboard?tab=notices",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/notices",
  PARENT: "/parent/notices",
};

// A student's profile, writing and certificates make up their journey.
const ROLE_STUDENT_PROFILE = {
  SUPER_ADMIN: "/admin/dashboard?tab=schools",
  SCHOOL_ADMIN: "/school/dashboard?tab=students",
  TEACHER: "/teacher/dashboard?tab=students",
  STUDENT: "/student/journey",
  PARENT: "/parent/child",
};

const ROLE_WRITING = {
  SUPER_ADMIN: "/admin/dashboard",
  SCHOOL_ADMIN: "/school/dashboard?tab=magazine",
  TEACHER: "/teacher/dashboard",
  STUDENT: "/student/school-wall",
  PARENT: "/parent/journey",
};

const ROLE_MAGAZINE = {
  ...ROLE_WRITING,
  STUDENT: "/student/magazine",
};

function eventHrefForRole(eventId, role) {
  const id = encodeURIComponent(eventId);
  if (role === "STUDENT") return `/student/events/${id}`;
  if (role === "SUPER_ADMIN") return `/admin/events/${id}/manage`;
  return ROLE_EVENTS[role] || null;
}

/**
 * The in-dashboard screen that offers what public page `path` offers, for a
 * signed-in `role`. `userId` is the account id (a school account's id is the
 * school's id). `hash` keeps `#inquiry` meaning something. Returns null when
 * `path` is not a public page or the role is unknown.
 */
export function dashboardHrefForPublicPath(path, { role, userId, hash = "" } = {}) {
  const home = ROLE_HOME[role];
  if (!home || !isPublicPagePath(path)) return null;
  const [, section, id, sub, subId] = path.split("/");

  switch (section) {
    case "events":
      return id ? eventHrefForRole(decodeURIComponent(id), role) : ROLE_EVENTS[role];
    case "winners":
      return ROLE_EVENTS[role];
    case "trainings":
      return ROLE_TRAININGS[role];
    case "notices":
      return ROLE_NOTICES[role];
    case "students":
      return id ? ROLE_STUDENT_PROFILE[role] : home;
    case "writings":
      if (role === "STUDENT" && id) return `/student/school-wall/${encodeURIComponent(decodeURIComponent(id))}`;
      return ROLE_WRITING[role];
    case "magazines":
      if (role === "STUDENT" && id) {
        if (sub === "articles" && subId) return `/student/magazine/${encodeURIComponent(decodeURIComponent(subId))}`;
        return `/student/magazine/issues/${encodeURIComponent(decodeURIComponent(id))}`;
      }
      return ROLE_MAGAZINE[role];
    case "schools":
      // The school's own public page is managed in Public Profile; questions
      // sent from it arrive in Inquiries.
      if (role === "SCHOOL_ADMIN" && id && userId && decodeURIComponent(id) === String(userId)) {
        return hash === "#inquiry" ? "/school/dashboard?tab=inquiries" : "/school/dashboard?tab=showcase";
      }
      return home;
    default:
      // search, student-voices: browsing the public site has no dashboard twin.
      return home;
  }
}

function documentTitle(path) {
  const match = DOCUMENT_TITLES.find(([prefix]) => startsWithSegment(path, prefix));
  return match ? match[1] : "Document";
}

/**
 * Decide what opening `href` should do for a signed-in `role`.
 *
 * Returns one of:
 *   { action: "navigate", href }        — an in-app navigation
 *   { action: "viewer", href, title }   — a certificate document in the viewer
 *   { action: "download", href }        — save the certificate PDF in place
 *   null                                — not ours (other site, hash link…)
 *
 * `origin` is the current site origin; `currentPath` lets same-page hash
 * links pass untouched; `userId` is the signed-in account's id.
 */
export function resolveDashboardLink(href, { role, userId, origin, currentPath = "" } = {}) {
  if (!href || !origin) return null;

  let url;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }

  // Other websites cannot be shown inside the dashboard; leave them alone.
  if (url.origin !== origin) return null;
  if (url.hash && url.pathname === currentPath) return null;

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const local = `${path}${url.search}${url.hash}`;

  if (path === "/" || isDashboardPath(path)) return { action: "navigate", href: local };
  if (PASS_THROUGH_PREFIXES.some((prefix) => startsWithSegment(path, prefix))) return null;

  if (isDocumentPath(path)) {
    if (startsWithSegment(path, "/certificates") && ["pdf", "1"].includes(url.searchParams.get("download"))) {
      return { action: "download", href: local };
    }
    // `embed=1` drops the document's own navigation bar.
    url.searchParams.set("embed", "1");
    return { action: "viewer", href: `${path}${url.search}`, title: documentTitle(path) };
  }

  // Any other page of the public site (including privacy, terms, contact):
  // the matching dashboard screen, or the role's home.
  const target = dashboardHrefForPublicPath(path, { role, userId, hash: url.hash }) || ROLE_HOME[role];
  return target ? { action: "navigate", href: target } : null;
}
