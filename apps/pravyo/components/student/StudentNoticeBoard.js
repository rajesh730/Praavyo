"use client";

import Link from "next/link";
import { Bell as FaBell, CalendarDays as FaCalendarAlt, School as FaSchool } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import {
  NotificationNewBadge,
  NotificationTypeBadge,
} from "@/components/notifications/NotificationUi";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import AppDate from "@/components/common/AppDate";
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
        <div className="space-y-4">
          {notifications.map((notification) => (
            <article
              key={`${notification.noticeType}-${notification.id}`}
              className="card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <NotificationTypeBadge
                      noticeType={notification.noticeType}
                      detailed
                    />
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">
                    {notification.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {notification.message}
                  </p>
                </div>

                <div className="text-right text-sm text-muted">
                  <div className="inline-flex items-center gap-2">
                    <FaCalendarAlt className="text-muted" />
                    <span><AppDate value={notification.publishedAt} mode="dateTime" /></span>
                  </div>
                  {!notification.isRead && (
                    <div className="mt-3">
                      <NotificationNewBadge isRead={notification.isRead} />
                    </div>
                  )}
                  {notification.event && (
                    <div className="mt-3 inline-flex items-center gap-2 text-ink">
                      <FaSchool className="text-muted" />
                      <span>{notification.event.title}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={notification.href}
                    className="btn btn-danger inline-flex items-center font-semibold transition-colors"
                  >
                    {notification.noticeType === "EVENT"
                      ? "Open Event"
                      : "Back to Dashboard"}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
