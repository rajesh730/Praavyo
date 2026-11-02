'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { Menu as FaBars, X as FaTimes } from 'lucide-react';
import PravyoLogo from './brand/PravyoLogo.js';
import CasSidebar from './CasSidebar.js';
import { CAS_NAV_LINKS } from './navigation/casNavigation.js';
import { casFetch, invalidateCasQueryCache, useCasQuery } from '../lib/client/useCas.js';
import { configureCasRealtime } from '../lib/client/casSync.js';
import InstallAppButton from '@pravyo/ui/installApp';

/**
 * The authenticated shell.
 *
 * Fetches the school context once and shares it, so every screen reads the same
 * school, grade list and academic year instead of each refetching them.
 */
const CasContext = createContext(null);
const CONTEXT_PATH = '/api/cas/context';
const EMPTY_YEARS = [];

function readStoredLanguage() {
  try {
    return window.localStorage.getItem('cas.lang') === 'ne' ? 'ne' : 'en';
  } catch {
    return 'en';
  }
}

function subscribeToLanguage(onChange) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

const serverLanguage = () => 'en';

export function useCas() {
  const value = useContext(CasContext);
  if (!value) throw new Error('useCas must be used inside CasLayout');
  return value;
}

export default function CasLayout({ children, embedded = false }) {
  const { data: session, status } = useSession();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const pathname = usePathname();
  const [languageChoice, setLangState] = useState(null);
  const storedLanguage = useSyncExternalStore(
    subscribeToLanguage,
    readStoredLanguage,
    serverLanguage,
  );
  const lang = languageChoice || storedLanguage;
  // Each CAS screen remembers its own academic year until the page is
  // refreshed, so leaving a screen and coming back keeps the same view.
  const [yearByScreen, setYearByScreen] = useRememberedState('cas:year-by-screen', {});
  const yearId = yearByScreen[pathname] || '';
  const setYearId = useCallback(
    (value) => setYearByScreen((current) => ({ ...current, [pathname]: value })),
    [pathname, setYearByScreen],
  );

  // Sections, grades and years are edited on the Pravyo dashboard, often in
  // another tab. Start from a fresh copy rather than the per-tab cache...
  useState(() => invalidateCasQueryCache(CONTEXT_PATH));
  const { data: context, loading, error, setData: setContext } = useCasQuery(CONTEXT_PATH);

  useEffect(() => {
    configureCasRealtime(context?.actor?.school);
    return () => configureCasRealtime('');
  }, [context?.actor?.school]);

  const refreshContext = useRef(null);
  const firstPath = useRef(pathname);
  // ...and re-read it quietly on returning to the tab and on each CAS screen,
  // so a deleted section disappears without a reload or losing typed work.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      casFetch(CONTEXT_PATH)
        .then((fresh) => {
          if (cancelled) return;
          invalidateCasQueryCache(CONTEXT_PATH);
          setContext(fresh);
        })
        .catch(() => {});
    };
    refreshContext.current = refresh;
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [setContext]);
  useEffect(() => {
    if (pathname !== firstPath.current) refreshContext.current?.();
  }, [pathname]);

  // Language is a per-device display preference, so it belongs in the browser
  // rather than on the school record.
  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      window.localStorage.setItem('cas.lang', next);
    } catch {
      // Not worth surfacing; the choice simply will not persist.
    }
  }, []);

  // A revoked session on the shared Pravyo token signs the user out here too.
  useEffect(() => {
    if (session?.error === 'SessionRevoked') signOut({ callbackUrl: '/login' });
  }, [session]);

  useEffect(() => {
    if (!isNavOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isNavOpen]);

  const years = context?.years || EMPTY_YEARS;
  const academicYear =
    years.find((y) => y.id === yearId) || context?.selectedYear || null;

  const value = useMemo(
    () => ({
      school: context?.school || null,
      actor: context?.actor || null,
      years,
      academicYear,
      setYearId,
      lang,
      setLang,
      // Pick the Nepali string when the user is reading Nepali and one exists.
      t: (en, ne) => (lang === 'ne' && ne ? ne : en),
    }),
    [context, years, academicYear, setYearId, lang, setLang],
  );

  if (status === 'loading' || loading) {
    return (
      <div className={`flex ${embedded ? 'py-16' : 'min-h-dvh'} items-center justify-center px-4`}>
        <div className="flex flex-col items-center text-center" role="status">
          <PravyoLogo variant="icon" compact withSurface />
          <div className="progress-bar mt-5 w-40" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-muted">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex ${embedded ? 'py-16' : 'min-h-dvh'} items-center justify-center px-4`}>
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-lg">Could not load your school</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  // Embedded: provide the CAS data only, inside another app shell (the super
  // admin's theme library sits in the normal admin dashboard with its menu).
  if (embedded) {
    return <CasContext.Provider value={value}>{children}</CasContext.Provider>;
  }

  const isTeacher = context?.actor?.role === 'TEACHER';
  const visibleLinks = isTeacher ? CAS_NAV_LINKS.slice(0, 1) : CAS_NAV_LINKS;
  const tabLinks = visibleLinks.slice(0, 4);
  const isLinkActive = (link) =>
    link.href === '/' ? pathname === '/' : pathname === link.href || pathname?.startsWith(`${link.href}/`);

  return (
    <CasContext.Provider value={value}>
      <div className="min-h-dvh">
        {isNavOpen && (
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setIsNavOpen(false)}
            className="app-backdrop"
          />
        )}

        <CasSidebar
          school={context?.school}
          academicYear={academicYear}
          isMobileOpen={isNavOpen}
          onNavigate={() => setIsNavOpen(false)}
          links={visibleLinks}
          returnHref={isTeacher ? '/teacher/dashboard?tab=assessment' : '/school/dashboard'}
        />

        <div className="app-main cas-print-flush">
          <header className="app-topbar cas-print-hide">
            <button
              type="button"
              onClick={() => setIsNavOpen((open) => !open)}
              className="btn-icon btn-ghost -ml-2 lg:hidden"
              aria-label={isNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={isNavOpen}
            >
              {isNavOpen ? <FaTimes className="text-lg" /> : <FaBars className="text-lg" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-ink">{context?.school?.name}</p>
              {context?.school?.address && (
                <p className="hidden truncate text-xs text-muted sm:block">{context.school.address}</p>
              )}
            </div>

            {years.length > 1 && (
              <select
                value={academicYear?.id || ''}
                onChange={(e) => setYearId(e.target.value)}
                aria-label="Academic year"
                className="hidden w-auto sm:block"
              >
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            )}
            <InstallAppButton />
            <div className="tabs shrink-0" role="group" aria-label="Display language">
              {[
                ['en', 'EN'],
                ['ne', 'ने'],
              ].map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  aria-pressed={lang === code}
                  className={`tab ${lang === code ? 'is-active' : ''} ${code === 'ne' ? 'cas-ne' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <main className="min-h-dvh overflow-x-hidden">
            <div className="app-frame">{children}</div>
          </main>
        </div>

        <nav className="tabbar cas-print-hide" aria-label="CAS">
          {tabLinks.map((link) => {
            const Icon = link.icon;
            const active = isLinkActive(link);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`tabbar-item ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                <span className="max-w-full truncate px-1">{link.name.split(' ').slice(-1)[0]}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setIsNavOpen((open) => !open)}
            className={`tabbar-item ${isNavOpen ? 'is-active' : ''}`}
            aria-expanded={isNavOpen}
            aria-label="Open full menu"
          >
            <FaBars aria-hidden="true" />
            <span>Menu</span>
          </button>
        </nav>
      </div>
    </CasContext.Provider>
  );
}
