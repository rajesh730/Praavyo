"use client";

import Link from "next/link";
import { PUBLIC_NAV_LINKS } from "@/components/navigation/appNavigation";

/**
 * The phone navigation bar — icons pinned to the bottom, the way a native app
 * puts its primary destinations in thumb reach.
 *
 * Only the four browsing destinations live here (Home, Schools, Events,
 * Winners). Login and Register are deliberately excluded: a tab bar is for
 * places you move BETWEEN, not one-time actions, and an account button sitting
 * permanently on screen for a signed-in user is noise. Those stay in the header.
 *
 * Hidden from `xl` up, where the existing horizontal nav takes over — this is
 * additive, so the desktop layout is untouched.
 */
export default function MobileTabBar({ active = "home" }) {
  return (
    <nav aria-label="Primary" className="tabbar lg:grid xl:hidden">
      {PUBLIC_NAV_LINKS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`tabbar-item ${isActive ? "is-active" : ""}`}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
