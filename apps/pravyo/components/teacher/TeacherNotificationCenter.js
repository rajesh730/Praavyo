"use client";

import NotificationBell from "@/components/notifications/NotificationBell";

/** The teacher's bell: school notices for teachers, events of their grades, personal alerts. */
export default function TeacherNotificationCenter() {
  return (
    <NotificationBell
      listUrl="/api/teacher/notifications"
      readUrl="/api/teacher/notifications/read"
      realtimeChannel="teacher-notifications"
      limit={15}
      title="Notifications"
      subtitle="School notices, events & your classes"
      viewAllHref="/teacher/notices"
      viewAllLabel="See all notifications"
      toastMessageBuilder={(notification) =>
        notification.noticeType === "EVENT"
          ? `New event: ${notification.title}`
          : notification.noticeType === "MAGAZINE"
          ? `Writing update: ${notification.title}`
          : `New notice: ${notification.title}`
      }
    />
  );
}
