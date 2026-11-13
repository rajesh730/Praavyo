/**
 * Signed-in people stay inside their dashboard (owner rule, 2026-11-13).
 *
 * Every link a dashboard screen opens is resolved here first:
 *   - dashboard pages and `/` (the proxy sends `/` to the role's dashboard)
 *     navigate normally;
 *   - `/events/<id>` goes to the same event inside the role's own dashboard;
 *   - a certificate `?download=pdf` link saves the PDF without leaving;
 *   - every other page of the public site — certificates, verify, trainings,
 *     school and student profiles, writings, winners… — opens in the viewer
 *     ON TOP of the dashboard, so closing it returns to the same screen.
 *
 * Pure functions only, so the rules are testable without a browser.
 */

export const DASHBOARD_PREFIXES = ["/admin", "/school", "/teacher", "/student", "/parent"];

// Not dashboards, but not places to preview either: auth screens and system
// paths keep their normal behaviour.
const PASS_THROUGH_PREFIXES = ["/api", "/_next", "/login", "/register", "/offline"];

const VIEWER_TITLES = [
  ["/certificates/bulk", "Certificates"],
  ["/certificates", "Certificate"],
  ["/verify", "Verify certificate"],
  ["/trainings", "Training"],
  ["/events", "Event"],
  ["/schools", "School page"],
  ["/students", "Student profile"],
  ["/writings", "Writing"],
  ["/magazines", "Magazine"],
  ["/winners", "Winners"],
  ["/notices", "Notices"],
  ["/search", "Search"],
  ["/student-voices", "Student voices"],
];

function startsWithSegment(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function isDashboardPath(path = "") {
  return DASHBOARD_PREFIXES.some((prefix) => startsWithSegment(path, prefix));
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

function eventHrefForRole(eventId, role) {
  const id = encodeURIComponent(eventId);
  if (role === "STUDENT") return `/student/events/${id}`;
  if (role === "SUPER_ADMIN") return `/admin/events/${id}/manage`;
  // A notice can announce a platform event the school has not joined yet, so
  // the Platform Events list (with its Join button) is the safe landing spot.
  if (role === "SCHOOL_ADMIN") return "/school/dashboard?tab=platform-events";
  if (role === "TEACHER") return "/teacher/dashboard?tab=events";
  if (role === "PARENT") return "/parent/events";
  return null;
}

function viewerTitle(path) {
  const match = VIEWER_TITLES.find(([prefix]) => startsWithSegment(path, prefix));
  return match ? match[1] : "Preview";
}

/**
 * Decide what opening `href` should do for a signed-in `role`.
 *
 * Returns one of:
 *   { action: "navigate", href }        — a normal in-app navigation
 *   { action: "viewer", href, title }   — open in the in-dashboard viewer
 *   { action: "download", href }        — save the certificate PDF in place
 *   null                                — not ours (other site, hash link…)
 *
 * `origin` is the current site origin; `currentPath` lets same-page hash
 * links pass untouched.
 */
export function resolveDashboardLink(href, { role, origin, currentPath = "" } = {}) {
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

  // An event detail page has a twin inside every dashboard.
  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    const target = eventHrefForRole(decodeURIComponent(eventMatch[1]), role);
    if (target) return { action: "navigate", href: target };
  }

  if (startsWithSegment(path, "/certificates")) {
    if (["pdf", "1"].includes(url.searchParams.get("download"))) {
      return { action: "download", href: local };
    }
    // `embed=1` drops the page's own "Back to platform" bar.
    url.searchParams.set("embed", "1");
    return { action: "viewer", href: `${path}${url.search}`, title: viewerTitle(path) };
  }

  return { action: "viewer", href: local, title: viewerTitle(path) };
}
