"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { NotificationProvider } from "@/components/NotificationSystem";
import { setRememberedStateOwner } from "@pravyo/ui/rememberedState";
import { DashboardLinkProvider } from "@/components/dashboard/DashboardLinkProvider";

/**
 * Remembered filters belong to one person: when the signed-in user (or the
 * school a teacher is working in) changes, every screen starts from defaults.
 */
function RememberedStateOwner() {
  const { data: session, status } = useSession();
  if (status !== "loading") {
    setRememberedStateOwner(session?.user ? `${session.user.id}:${session.user.schoolId || ""}` : null);
  }
  return null;
}

export function Providers({ children }) {
  // The session rarely changes and each refetch runs a DB query in the jwt
  // callback, so don't re-validate on every tab focus; a periodic refresh is
  // enough.
  //
  // NotificationProvider must wrap the whole app: the notification bell
  // (useNotificationInbox -> useNotification) and toast pop-ups are used across
  // the student, school, and admin dashboards, not just on public pages.
  //
  // DashboardLinkProvider keeps a signed-in person inside their dashboard:
  // public pages (certificates, trainings, profiles…) open in a viewer on top
  // of it instead of taking them out to the public site.
  return (
    <SessionProvider refetchInterval={600} refetchOnWindowFocus={false}>
      <RememberedStateOwner />
      <NotificationProvider>
        <DashboardLinkProvider>{children}</DashboardLinkProvider>
      </NotificationProvider>
    </SessionProvider>
  );
}
