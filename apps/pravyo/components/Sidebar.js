"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOutAndForgetDevice } from "@pravyo/ui/signOutDevice";
import { useEffect, useRef, useState } from "react";
import { LogOut as FaSignOutAlt, School as FaSchool, X as FaTimes, ArrowLeftRight as FaExchangeAlt, CalendarDays as FaCalendarAlt, GraduationCap as FaUserGraduate, MessageSquareText as FaCommentDots } from "lucide-react";
import PravyoLogo from "@/components/brand/PravyoLogo";
import NavItemLink from "@/components/navigation/NavItemLink";
import { getRoleNavigationLinks, isNavLinkActive } from "@/components/navigation/appNavigation";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import InstallAppButton from "@pravyo/ui/installApp";

const HREF_INDICATOR_KEYS = {
  "/admin/dashboard?tab=approvals": "admin.approvals",
  "/admin/dashboard?tab=events": "admin.events",
  "/admin/feedback": "admin.feedback",
  "/admin/dashboard?tab=spotlight": "admin.spotlight",
  "/school/dashboard?tab=student-transfers": "school.studentTransfers",
  "/school/dashboard?tab=school-events": "school.schoolEvents",
  "/school/dashboard?tab=platform-events": "school.platformEvents",
  "/school/dashboard?tab=student-notices": "school.studentNotices",
  "/school/dashboard?tab=notices": "school.receivedNotices",
  "/school/dashboard?tab=magazine": "school.magazine",
  "/school/dashboard?tab=inquiries": "school.inquiries",
  "/student/events": "student.events",
  "/student/notices": "student.notices",
  "/student/school-wall": "student.schoolWall",
  "/student/magazine": "student.schoolMagazine",
};

const HREF_SEEN_SURFACES = {};

// Quick links to the School Overview analytics sections, surfaced as a popup
// when the admin hovers their school card.
const SCHOOL_ANALYTICS_LINKS = [
  {
    name: "Students In / Out",
    href: "/school/dashboard?tab=overview&section=students",
    icon: FaUserGraduate,
  },
  {
    name: "Transfer History",
    href: "/school/dashboard?tab=overview&section=transfers",
    icon: FaExchangeAlt,
  },
  {
    name: "Event History",
    href: "/school/dashboard?tab=overview&section=events",
    icon: FaCalendarAlt,
  },
];

const SCHOOL_NAV_GROUPS = [
  {
    title: "School Operations",
    names: [
      "Overview",
      "Students",
      "Manage Sections",
      "Manage Subjects",
      "Student Transfer",
      "Exams",
      "Parents & Guardians",
      "Parent Messages",
      "Feedback",
      "Teachers",
      "School Events",
      "Platform Events",
      "Student Notices",
      "Teacher Notices",
      "Received Notices",
    ],
  },
  {
    title: "Public Showcase",
    names: ["Publishing Desk", "Gallery", "Certificates", "Public Profile"],
  },
  {
    title: "Platform",
    names: ["Settings", "History"],
  },
];

function getInitials(name = "") {
  return (
    String(name)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function getRoleLabel(role) {
  return String(role || "User")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Sidebar({
  role,
  isRestricted = false,
  isPending = false,
  isMobileOpen = false,
  onNavigate,
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get("tab");
  const { getIndicator, markSurfaceSeen } = useWorkIndicators({
    enabled: Boolean(role && !isPending),
  });
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  // The school's logo (Public Profile) beside its name; initials until it loads.
  const [schoolLogo, setSchoolLogo] = useState("");
  const isSchoolAccount = session?.user?.role === "SCHOOL_ADMIN";
  useEffect(() => {
    if (!isSchoolAccount) return undefined;
    let live = true;
    fetch("/api/school/brand", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => live && payload?.logoUrl && setSchoolLogo(payload.logoUrl))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isSchoolAccount]);

  useEffect(() => {
    if (session?.error === "SessionRevoked") {
      signOutAndForgetDevice({ callbackUrl: "/login" });
    }
  }, [session]);

  // Close the account analytics menu on outside click or Escape.
  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointer = (event) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setAccountMenuOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [accountMenuOpen]);

  let links = getRoleNavigationLinks(role);

  if (isPending) {
    links = [];
  } else if (isRestricted && role === "SCHOOL_ADMIN") {
    links = links.filter((link) => link.name === "Settings");
  }

  // Groups select links BY NAME, so a link added to SCHOOL_NAV_LINKS without a
  // matching entry above would silently render nowhere — it is absent from the
  // sidebar with nothing failing and nothing logged. That has already cost a
  // debugging session once. Anything unmatched falls through to the end rather
  // than disappearing: a link in the wrong section is obvious and fixable, an
  // invisible one is not.
  const groupedLinks =
    role === "SCHOOL_ADMIN"
      ? (() => {
          const grouped = SCHOOL_NAV_GROUPS.map((group) => ({
            ...group,
            links: links.filter((link) => group.names.includes(link.name)),
          }));
          const placed = new Set(SCHOOL_NAV_GROUPS.flatMap((g) => g.names));
          const ungrouped = links.filter((link) => !placed.has(link.name));
          return [...grouped, { title: "More", links: ungrouped }].filter(
            (group) => group.links.length > 0,
          );
        })()
      : [{ title: null, links }];

  const userName = session?.user?.name || session?.user?.email || "User";
  const userRole = session?.user?.role || role || "USER";
  const initials = getInitials(session?.user?.name || "");

  return (
    <aside className="app-sidebar" data-open={isMobileOpen ? "true" : "false"} aria-label="Main navigation">
      {/* Brand */}
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-line px-4">
        <PravyoLogo variant="icon" compact />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand">Praavyo</p>
          <p className="truncate text-sm font-semibold leading-tight text-ink">
            {session?.user?.schoolName || "School Platform"}
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigate}
          className="btn-icon btn-ghost btn-sm lg:hidden"
          aria-label="Close navigation"
        >
          <FaTimes />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-1">
        {groupedLinks.map((group) => (
          <div key={group.title || "main"} className="pt-1">
            {group.title && <p className="nav-section">{group.title}</p>}
            <div className="space-y-0.5">
              {group.links.map((link) => {
                const Icon = link.icon;
                const isActive = isNavLinkActive(link, pathname, currentTab);
                const indicator = getIndicator(HREF_INDICATOR_KEYS[link.href]);

                return (
                  <NavItemLink
                    key={link.href}
                    href={link.href}
                    label={link.name}
                    icon={Icon}
                    active={isActive}
                    indicator={indicator}
                    onClick={() => {
                      const seenSurface = HREF_SEEN_SURFACES[link.href];
                      if (seenSurface) void markSurfaceSeen(seenSurface);
                      onNavigate?.();
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {links.length === 0 && (
          <div className="mt-3 rounded-card border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">
            <FaSchool className="mx-auto mb-2 text-lg text-subtle" />
            Navigation will appear after your account is active.
          </div>
        )}
      </nav>

      {/* Account */}
      <div className="shrink-0 border-t border-line p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        {session?.user && (
          <div className="relative mb-1" ref={accountMenuRef}>
            {userRole === "SCHOOL_ADMIN" ? (
              <button
                type="button"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className="flex w-full items-center gap-2.5 rounded-control p-2 text-left transition-colors hover:bg-surface-2"
              >
                <AccountSummary initials={initials} logoUrl={userRole === "SCHOOL_ADMIN" ? schoolLogo : ""} userName={userName} role={getRoleLabel(userRole)} />
              </button>
            ) : (
              <div className="flex items-center gap-2.5 p-2">
                <AccountSummary initials={initials} logoUrl={userRole === "SCHOOL_ADMIN" ? schoolLogo : ""} userName={userName} role={getRoleLabel(userRole)} />
              </div>
            )}

            {userRole === "SCHOOL_ADMIN" && accountMenuOpen && (
              <div className="absolute inset-x-0 bottom-full z-50 mb-2 rounded-card border border-line bg-surface p-1.5 shadow-pop" role="menu">
                <Link
                  href="/school/dashboard?tab=praavyo-feedback"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onNavigate?.();
                  }}
                  className="nav-item"
                >
                  <FaCommentDots />
                  <span>Send feedback to Praavyo</span>
                </Link>
                <div className="my-1 border-t border-line" />
                <p className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">Analytics</p>
                {SCHOOL_ANALYTICS_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        onNavigate?.();
                      }}
                      className="nav-item"
                    >
                      <Icon />
                      <span>{link.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* Phones have it in the top bar; the desktop shell has no top bar. */}
        <div className="mb-1 hidden lg:block">
          <InstallAppButton className="is-block" />
        </div>
        <button
          type="button"
          onClick={() => signOutAndForgetDevice({ callbackUrl: "/login" })}
          className="nav-item w-full hover:!bg-danger-soft hover:!text-danger"
        >
          <FaSignOutAlt />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}

function AccountSummary({ initials, logoUrl = "", userName, role }) {
  return (
    <>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line bg-white object-contain p-0.5" />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
          {initials}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-ink">{userName}</span>
        <span className="block truncate text-2xs text-muted">{role}</span>
      </span>
    </>
  );
}
