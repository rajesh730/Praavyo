"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import { formatRelativeTime, getNotificationType, getNotificationTypeLabel } from "@/components/notifications/NotificationUi";

/** Every notification of the teacher's bell, newest first, with full text. */
async function fetchNotices() {
  try {
    const res = await fetch("/api/teacher/notifications?limit=100", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.message || "Could not load notices" };
    return { items: Array.isArray(data.notifications) ? data.notifications : [] };
  } catch {
    return { error: "Could not load notices" };
  }
}

export default function TeacherNoticeList() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const apply = useCallback((result) => {
    if (result.error) setError(result.error);
    else {
      setItems(result.items);
      setError("");
    }
    setLoading(false);
  }, []);
  const load = useCallback(() => fetchNotices().then(apply), [apply]);

  useEffect(() => {
    let live = true;
    fetchNotices().then((result) => live && apply(result));
    return () => {
      live = false;
    };
  }, [apply]);
  useRealtimeChannel("teacher-notifications", load);

  const mark = async (body) => {
    await fetch("/api/teacher/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  const open = async (item) => {
    if (!item.isRead) {
      setItems((current) => current.map((row) => (row === item ? { ...row, isRead: true } : row)));
      await mark({ action: "read", notifications: [{ id: item.id, noticeType: item.noticeType }] });
    }
    if (item.href && item.href !== "/teacher/notices") router.push(item.href);
  };

  const markAll = async () => {
    setItems((current) => current.map((row) => ({ ...row, isRead: true })));
    await mark({ action: "read", allVisible: true });
  };

  if (loading) return <LoadingState title="Loading notices" message="Collecting your school's notices." />;
  if (error) return <AlertBanner type="error" title="Notices unavailable" message={error} />;

  const unread = items.filter((item) => !item.isRead).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 && (
          <button type="button" onClick={markAll} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <CheckCheck size={16} aria-hidden /> Mark all as read
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <BellOff aria-hidden className="mx-auto text-subtle" size={28} />
          <p className="mt-3 font-semibold text-ink">No notices yet</p>
          <p className="mt-1 text-sm text-muted">Notices your school sends to teachers, and updates about your classes, appear here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const type = getNotificationType(item.noticeType);
            const Icon = type.Icon;
            return (
              <li key={`${item.noticeType}:${item.id}`}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className={`card flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-surface-2 ${item.isRead ? "" : "border-brand-line bg-brand-soft/40"}`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${type.circle}`}>
                    <Icon aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{item.title}</span>
                      {!item.isRead && <span className="badge badge-brand text-2xs">New</span>}
                    </span>
                    {item.message && <span className="mt-1 block whitespace-pre-wrap text-sm leading-6 text-muted">{item.message}</span>}
                    <span className="mt-1.5 block text-xs font-semibold text-subtle">
                      {getNotificationTypeLabel(item.noticeType)} · {formatRelativeTime(item.publishedAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
