'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { LogOut as FaSignOutAlt, X as FaTimes, ArrowLeft as FaArrowLeft } from 'lucide-react';
import PravyoLogo from './brand/PravyoLogo.js';
import NavItemLink from './navigation/NavItemLink.js';
import { CAS_NAV_LINKS } from './navigation/casNavigation.js';

export default function CasSidebar({ school, academicYear, isMobileOpen, onNavigate, links = CAS_NAV_LINKS, returnHref = '/school/dashboard', area = 'cas' }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  /**
   * A revoked session must not linger on screen.
   *
   * The shared jwt callback re-reads `authVersion` from the user record and
   * flags a session the school has since revoked; this clears it on the next
   * render rather than leaving a signed-out user looking at assessment data.
   */
  useEffect(() => {
    if (session?.error === 'SessionRevoked') {
      signOut({ callbackUrl: '/login' });
    }
  }, [session]);

  return (
    <aside className="app-sidebar cas-print-hide" data-open={isMobileOpen ? 'true' : 'false'} aria-label="CAS navigation">
      <div className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2.5 border-b border-line px-4">
        <PravyoLogo variant="icon" compact />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-brand">{area === 'internal' ? 'Praavyo Internal Exam' : 'Praavyo CAS'}</p>
          <p className="truncate text-sm font-semibold leading-tight text-ink">
            {school?.name || session?.user?.schoolName || 'School'}
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

      {academicYear && (
        <div className="px-4 pt-3">
          <p className="flex items-center justify-between rounded-control border border-line bg-surface-2 px-3 py-2 text-xs">
            <span className="text-muted">Academic year</span>
            <span className="font-semibold text-ink">{academicYear.label}</span>
          </p>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 pt-2">
        <p className="nav-section">{area === 'internal' ? 'Internal Exam' : 'Assessment'}</p>
        {links.map((link) => (
          <NavItemLink
            key={link.href}
            href={link.href}
            label={link.name}
            initials={link.initials}
            icon={link.icon}
            active={
              link.href === '/'
                ? pathname === '/'
                : pathname === link.href || pathname?.startsWith(`${link.href}/`)
            }
            onClick={onNavigate}
          />
        ))}
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-line p-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
        {/* The way out of the CAS workspace. Same app, same session — this is
            ordinary navigation, not a hand-off to another origin — but CAS
            replaces the Pravyo chrome rather than nesting in it, so without
            this link there is no visible route back. */}
        <Link href={returnHref} className="nav-item">
          <FaArrowLeft />
          <span>Back to Praavyo</span>
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="nav-item w-full hover:!bg-danger-soft hover:!text-danger"
        >
          <FaSignOutAlt />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
