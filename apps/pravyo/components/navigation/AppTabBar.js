"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

/**
 * Phone bottom navigation for the signed-in shells.
 *
 * Shows the first few existing destinations of the user's navigation and a
 * "Menu" button that opens the full navigation drawer, so every module stays
 * reachable without inventing new routes. Hidden from the lg breakpoint up,
 * where the sidebar is always visible.
 *
 * `links` items: { name, href, icon }. `isActive(link)` decides the current
 * item using the same rule as the sidebar.
 */
export default function AppTabBar({ links = [], isActive, onOpenMenu, menuOpen = false, max = 4 }) {
  const primary = links.slice(0, max);
  return (
    <nav className="tabbar cas-print-hide" aria-label="Primary">
      {primary.map((link) => {
        const Icon = link.icon;
        const active = isActive ? isActive(link) : false;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`tabbar-item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span className="max-w-full truncate px-1">{shortLabel(link.name)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className={`tabbar-item ${menuOpen ? "is-active" : ""}`}
        aria-expanded={menuOpen}
        aria-label="Open full menu"
      >
        <Menu aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}

// Tab labels have room for about one word.
function shortLabel(name = "") {
  const map = {
    "Manage Sections": "Sections",
    "Student Transfer": "Transfers",
    "Parents & Guardians": "Parents",
    "Parent Messages": "Messages",
    "My Workspace": "Workspace",
    "My Profile": "Profile",
    "Platform Events": "Events",
    "School Events": "Events",
    "School Magazine": "Magazine",
    "Student Notices": "Notices",
    "Received Notices": "Notices",
  };
  return map[name] || name;
}
