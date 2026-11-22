"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sprout, GraduationCap, CalendarDays, MessageCircle, UserRound } from "lucide-react";
import { useParentApp } from "./ParentAppContext";
import styles from "./ParentDesign.module.css";

const TABS = [
  { href: "/parent", icon: Home, labelKey: "nav.home", exact: true },
  { href: "/parent/journey", icon: Sprout, labelKey: "nav.journey" },
  // Published continuous-assessment reports. Without a tab here the only
  // route to a child's results was one link below the fold on /parent.
  // Results and Progress both live under /parent/learning.
  { href: "/parent/learning/cas", match: "/parent/learning", icon: GraduationCap, labelKey: "nav.learning", shortLabelKey: "nav.learningShort" },
  { href: "/parent/events", icon: CalendarDays, labelKey: "nav.events" },
  { href: "/parent/messages", icon: MessageCircle, labelKey: "nav.messages" },
  { href: "/parent/child", icon: UserRound, labelKey: "nav.child" },
];

// `compact` = the phone bar, where six labels share one row: short labels.
function NavItems({ badges, compact = false }) {
  const pathname = usePathname();
  const { t } = useParentApp();
  return <ul className={styles.navList}>{TABS.map((tab) => {
    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.match || tab.href);
    const Icon = tab.icon;
    const count = badges[tab.href] || 0;
    return <li key={tab.href}>
      <Link href={tab.href} aria-current={active ? "page" : undefined} className={styles.navLink}>
        <span className={styles.navIcon}>
          <Icon aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
          {count > 0 && <span className={styles.badge} aria-label={t("nav.newCount", { count })}>{count > 9 ? "9+" : count}</span>}
        </span>
        <span>{t(compact && tab.shortLabelKey ? tab.shortLabelKey : tab.labelKey)}</span>
      </Link>
    </li>;
  })}</ul>;
}

export default function ParentBottomNav({ badges = {} }) {
  const { t } = useParentApp();
  return <nav className={`${styles.bottomNav} cas-print-hide`} aria-label={t("nav.parentNavigation")}><NavItems badges={badges} compact /></nav>;
}

export function ParentNavRail({ badges = {} }) {
  const { t } = useParentApp();
  return <nav className={`${styles.rail} cas-print-hide`} aria-label={t("nav.parentNavigation")}>
    <div className={styles.railBrand}><Link href="/parent" className={styles.brand}><strong>Praavyo.</strong><span>{t("home.parentSpace")}</span></Link></div>
    <NavItems badges={badges} />
  </nav>;
}
export { TABS as PARENT_NAV_TABS };
