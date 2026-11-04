"use client";

import { useCallback, useEffect } from "react";
import StudentEventsManager from "@/components/events/StudentEventsManager";
import StudentPrograms from "@/components/programs/StudentPrograms";
import StudentQuickNav from "@/components/student/StudentQuickNav";
import StudentNotificationCenter from "@/components/student/StudentNotificationCenter";
import useWorkIndicators from "@/lib/client/useWorkIndicators";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";

export default function StudentEventWorkspace() {
  const { loadIndicators } = useWorkIndicators();
  const markEventNotificationsRead = useCallback(async () => {
    try {
      const res = await fetch("/api/student/notifications?limit=100", {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok || !Array.isArray(payload.notifications)) return;

      const unreadEventNotifications = payload.notifications.filter(
        (notification) =>
          notification.noticeType === "EVENT" && !notification.isRead
      );

      if (unreadEventNotifications.length === 0) {
        await loadIndicators({ silent: true });
        return;
      }

      await fetch("/api/student/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifications: unreadEventNotifications.map((notification) => ({
            id: notification.id,
            noticeType: notification.noticeType,
            storageType: notification.storageType,
          })),
        }),
      }).catch(() => {});
      await loadIndicators({ silent: true });
    } catch (_error) {
      await loadIndicators({ silent: true });
    }
  }, [loadIndicators]);

  useEffect(() => {
    void markEventNotificationsRead();
  }, [markEventNotificationsRead]);

  useRealtimeChannel(
    "student-notifications",
    useCallback(() => {
      void markEventNotificationsRead();
    }, [markEventNotificationsRead])
  );

  return (
    <div className="space-y-4 text-ink">
        <StudentQuickNav className="sm:hidden" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-semibold text-ink">Student Events</h1>
            <p className="mt-2 text-muted">
              See what you are registered for, discover upcoming events, and
              follow notices, rounds, results, and certificates from one clear place.
            </p>
          </div>
          <StudentNotificationCenter />
        </div>

        <StudentPrograms />

        <StudentEventsManager />
    </div>
  );
}
