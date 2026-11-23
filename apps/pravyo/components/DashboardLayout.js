'use client';

import Sidebar from './Sidebar';
import { useSession } from 'next-auth/react';
import { signOutAndForgetDevice } from '@pravyo/ui/signOutDevice';
import DevicePushBanner from '@/components/notifications/DevicePushBanner';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Menu as FaBars, X as FaTimes } from 'lucide-react';
import PravyoLogo from '@/components/brand/PravyoLogo';
import IemisReminder from '@/components/school/IemisReminder';
import AppTabBar from '@/components/navigation/AppTabBar';
import InstallAppButton from '@pravyo/ui/installApp';
import TeacherNotificationCenter from '@/components/teacher/TeacherNotificationCenter';
import { getRoleNavigationLinks, isNavLinkActive } from '@/components/navigation/appNavigation';

const DEVICE_PUSH_ROLES = new Set(['STUDENT', 'TEACHER', 'SCHOOL_ADMIN']);

export default function DashboardLayout({ children }) {
  const { data: session } = useSession();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get('tab');

  useEffect(() => {
    if (session?.error === 'SessionRevoked') {
      signOutAndForgetDevice({ callbackUrl: '/login' });
    }
  }, [session]);

  useEffect(() => {
    if (!isNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isNavOpen]);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY;
      const movedEnough = Math.abs(currentScrollY - lastScrollY) > 8;

      if (movedEnough) {
        setIsHeaderHidden(scrollingDown && currentScrollY > 72);
        lastScrollY = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="flex flex-col items-center text-center" role="status">
          <PravyoLogo variant="icon" compact withSurface />
          <div className="progress-bar mt-5 w-40" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-muted">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  const userName = session?.user?.name || session?.user?.email || 'Dashboard';
  const userRole = String(session?.user?.role || 'User').replaceAll('_', ' ');
  const role = session?.user?.role || 'SCHOOL_ADMIN';
  const navLinks = getRoleNavigationLinks(role);
  const isTeacher = role === 'TEACHER';

  return (
    <div className="min-h-dvh">
      {/* Schools registered before IEMIS became compulsory are asked for it. */}
      {session?.user?.role === 'SCHOOL_ADMIN' && <IemisReminder />}

      {isNavOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setIsNavOpen(false)}
          className="app-backdrop"
        />
      )}

      <Sidebar
        role={role}
        isMobileOpen={isNavOpen}
        onNavigate={() => setIsNavOpen(false)}
      />

      <div className="app-main">
        {/* Phone and tablet header; teachers keep it on desktop too, for
            their notification bell (as the school dashboard's top bar). */}
        <header
          className={`app-topbar transition-transform duration-200 ${isTeacher ? '' : 'lg:hidden'} ${
            isHeaderHidden && !isNavOpen ? '-translate-y-full lg:translate-y-0' : ''
          }`}
        >
          <span className={isTeacher ? 'lg:hidden' : ''}>
            <PravyoLogo variant="icon" compact withSurface />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-ink">{userName}</p>
            <p className="truncate text-2xs font-medium capitalize leading-tight text-muted">{userRole.toLowerCase()}</p>
          </div>
          <InstallAppButton />
          {isTeacher && !session?.error && <TeacherNotificationCenter />}
          <button
            type="button"
            id="dashboard-mobile-nav-toggle"
            onClick={() => setIsNavOpen((prev) => !prev)}
            className="btn-icon btn-ghost lg:hidden"
            aria-label={isNavOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isNavOpen}
          >
            {isNavOpen ? <FaTimes className="text-lg" /> : <FaBars className="text-lg" />}
          </button>
        </header>

        <main className="min-h-dvh overflow-x-hidden">
          <div className="app-frame">
            {/* Roles whose notices ring the device (lib/devicePush.js). */}
            {/* Not on the pages that show the full notifications card. */}
            {DEVICE_PUSH_ROLES.has(role) && !session?.error &&
              pathname !== '/student/account' && currentTab !== 'settings' &&
              !(pathname === '/teacher/dashboard' && currentTab === 'profile') && <DevicePushBanner role={role} />}
            {children}
          </div>
        </main>
      </div>

      <AppTabBar
        links={navLinks}
        isActive={(link) => isNavLinkActive(link, pathname, currentTab)}
        onOpenMenu={() => setIsNavOpen((prev) => !prev)}
        menuOpen={isNavOpen}
      />
    </div>
  );
}
