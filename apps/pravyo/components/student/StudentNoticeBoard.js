"use client";

import Link from "next/link";
import { ArrowRight, Bell as FaBell, CalendarDays as FaCalendarAlt, School as FaSchool } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import {
  NotificationNewBadge,
  NotificationTypeBadge,
} from "@/components/notifications/NotificationUi";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import AppDate from "@/components/common/AppDate";
import DateTile from "@/components/common/DateTile";
import useNotificationInbox from "@/lib/client/useNotificationInbox";

export default function StudentNoticeBoard() {
  const {
    loading,
    error,
    notifications,
  } =
    useNotificationInbox({
      listUrl: "/api/student/notifications",
      readUrl: "/api/student/notifications/read",
      limit: 100,
      realtimeChannel: "student-notifications",
      markVisibleOnLoad: true,
    });

  if (loading) {
    return (
      <LoadingState
        title="Loading student notices"
        message="Preparing school and event updates for you."
      />
    );
  }

  if (error) {
    return <AlertBanner type="error" title="Unable to load notices" message={error} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={FaBell}
        eyebrow="Student Updates"
        title="Notices"
        description="Read school announcements and event updates from one simple place."
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={FaBell}
          title="No notices yet"
          description="When your school or event organizers publish notices, they will appear here automatically."
        />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {notifications.map((notification) => (
            <li
              key={`${notification.noticeType}-${notification.id}`}
              className={`flex gap-3.5 p-4 sm:gap-4 sm:p-5 ${notification.isRead ? "" : "bg-brand-soft/40"}`}
            >
              {notification.publishedAt && <DateTile value={notification.publishedAt} />}
              <article className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <NotificationTypeBadge noticeType={notification.noticeType} detailed />
                  {!notification.isRead && <NotificationNewBadge isRead={notification.isRead} />}
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-ink">{notification.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-body">{notification.message}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <FaCalendarAlt aria-hidden />
                    <AppDate value={notification.publishedAt} mode="dateTime" />
                  </span>
                  {notification.event && (
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <FaSchool aria-hidden /> {notification.event.title}
                    </span>
                  )}
                </div>
              </article>
              {notification.noticeType === "EVENT" && notification.href && (
                <Link
                  href={notification.href}
                  className="inline-flex shrink-0 items-center gap-1 self-center whitespace-nowrap text-sm font-semibold text-brand hover:text-brand-strong hover:underline"
                >
                  Open event <ArrowRight aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
