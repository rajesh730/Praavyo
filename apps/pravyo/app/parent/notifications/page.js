"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useParentApp } from "@/components/parent/ParentAppContext";
import { useParentNotifications } from "@/components/parent/ParentNotificationContext";
import ParentEmptyState from "@/components/parent/ParentEmptyState";
import { notificationStatus } from "@/lib/parentStatus";
import { formatRelativeShort } from "@/lib/parentFormat";

/** Combined inbox; every row names its child and school before it deep-links. */
export default function ParentNotificationsPage() {
  const router = useRouter();
  const { t } = useParentApp();
  const {
    loading,
    error,
    notifications,
    refresh,
    markSeen,
    markRead,
    markAllRead,
  } = useParentNotifications();
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    void markSeen();
  }, [markSeen]);

  const openNotification = async (notification) => {
    if (pendingId) return;
    setPendingId(notification.id);
    try {
      if (notification.status !== "READ") await markRead(notification.id);
      router.push(notification.actionUrl || "/parent/notifications");
    } catch {
      // Authoritative state is restored by the shared provider. Leave the row
      // in place so the parent can retry instead of navigating on a failed write.
    } finally {
      setPendingId("");
    }
  };

  if (loading && notifications.length === 0) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading notifications">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-24 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
  }

  const hasNotRead = notifications.some(
    (notification) => notification.status !== "READ"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-ink">
            {t("settings.notifications")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Messages and notices across your children&apos;s schools
          </p>
        </div>
        {hasNotRead ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="btn btn-ghost shrink-0 font-semibold"
          >
            Mark all read
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-line bg-danger-soft p-3 text-sm text-danger"
        >
          <span>Notifications could not be refreshed.</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="btn btn-ghost font-semibold"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : null}

      {notifications.length === 0 ? (
        <ParentEmptyState emoji="🔔" title={t("home.allCaughtUp")} />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const descriptor = notificationStatus(notification.priority);
            const isRead = notification.status === "READ";

            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => void openNotification(notification)}
                  disabled={pendingId === notification.id}
                  className={[
                    "btn btn-secondary flex w-full gap-3 text-left transition-colors",
                    isRead
                      ? "border-line bg-surface"
                      : descriptor.classes.card,
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${descriptor.classes.dot}`}
                  >
                    {descriptor.icon}
                  </span>

                  <span className="min-w-0 flex-1">
                    {notification.child ? (
                      <span className="block text-2xs font-semibold uppercase tracking-wide text-muted">
                        {notification.child.name}
                        {notification.school ? ` • ${notification.school.name}` : ""}
                      </span>
                    ) : null}
                    <span className="block break-words font-semibold leading-snug text-ink">
                      {notification.title}
                    </span>
                    <span className="mt-0.5 block break-words text-sm leading-relaxed text-muted">
                      {notification.body}
                    </span>
                    <span className="mt-1 block text-2xs text-muted">
                      {formatRelativeShort(notification.createdAt)}
                    </span>
                  </span>

                  {!isRead ? (
                    <span
                      aria-label={notification.status === "UNREAD" ? "New" : "Not read"}
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

