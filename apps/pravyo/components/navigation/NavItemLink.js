"use client";

import Link from "next/link";
import WorkIndicatorBadge from "@/components/work-indicators/WorkIndicatorBadge";

export default function NavItemLink({
  href,
  label,
  icon: Icon,
  active = false,
  onClick,
  indicator,
  className = "",
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`nav-item ${active ? "is-active" : ""} ${className}`}
    >
      <Icon aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {indicator && (
        <WorkIndicatorBadge
          count={indicator.count}
          tone={indicator.tone}
          label={indicator.label}
          compact
        />
      )}
    </Link>
  );
}
