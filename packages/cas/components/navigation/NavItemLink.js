'use client';

import Link from 'next/link';

/**
 * One sidebar row.
 *
 * A compact icon and label keep the assessment workspace easy to scan without
 * turning navigation into a collection of visual tiles.
 */
export default function NavItemLink({
  href,
  label,
  initials,
  icon: Icon,
  active = false,
  onClick,
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`nav-item ${active ? 'is-active' : ''}`}
    >
      {Icon ? <Icon aria-hidden="true" /> : <span className="w-[1.0625rem] text-center text-2xs font-semibold">{initials}</span>}
      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>
    </Link>
  );
}
