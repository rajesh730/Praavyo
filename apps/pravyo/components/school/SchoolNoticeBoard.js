"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { Bell as FaBell, BookOpen as FaBookOpen, CircleCheck as FaCheckCircle, ClipboardList as FaClipboardList, Monitor as FaDesktop, Mail as FaEnvelope, Eye as FaEye, ListFilter as FaFilter, Megaphone as FaBullhorn, RefreshCw as FaSyncAlt } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/ui/LoadingState";
import AppDate from "@/components/common/AppDate";
import useNotificationInbox from "@/lib/client/useNotificationInbox";

function isToday(value) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

const TYPE_CONFIG = {
  ALL: {
    label: "All Notices",
    icon: FaClipboardList,
    tone: "purple",
    description: "All categories",
  },
  GENERAL: {
    label: "Platform",
    badge: "Platform",
    icon: FaDesktop,
    tone: "blue",
    description: "New updates",
  },
  EVENT: {
    label: "Event",
    badge: "Event",
    icon: FaBullhorn,
    tone: "rose",
    description: "Competitions & rounds",
  },
  MAGAZINE: {
    label: "Magazine",
    badge: "Magazine",
    icon: FaBookOpen,
    tone: "amber",
    description: "Submissions & reviews",
  },
};

const TONE_CLASSES = {
  purple: {
    card: "border-brand-line bg-brand-soft text-brand-strong",
    row: "border-l-brand",
    icon: "bg-brand-soft text-brand-strong",
    badge: "bg-brand-soft text-brand-strong",
  },
  blue: {
    card: "border-brand-line bg-brand-soft text-brand-strong",
    row: "border-l-brand",
    icon: "bg-brand-soft text-brand-strong",
    badge: "bg-brand-soft text-brand-strong",
  },
  rose: {
    card: "border-danger-line bg-danger-soft text-danger",
    row: "border-l-danger",
    icon: "bg-danger-soft text-danger",
    badge: "bg-danger-soft text-danger",
  },
  amber: {
    card: "border-warning-line bg-warning-soft text-warning",
    row: "border-l-warning",
    icon: "bg-warning-soft text-warning",
    badge: "bg-warning-soft text-warning",
  },
  emerald: {
    card: "border-success-line bg-success-soft text-success",
    row: "border-l-success",
    icon: "bg-success-soft text-success",
    badge: "bg-success-soft text-success",
  },
};

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.GENERAL;
}

function NoticeMetric({ icon: Icon, value, label, note, tone }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <span
          className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-control border text-lg sm:flex ${
            TONE_CLASSES[tone]?.card || TONE_CLASSES.purple.card
          }`}
        >
          <Icon />
        </span>
        <span className="min-w-0">
          <strong className="block text-2xl font-semibold text-ink">
            {value}
          </strong>
          <span className="block truncate text-sm font-semibold text-ink">
            {label}
          </span>
          <span className="mt-1 block text-xs font-semibold text-muted">
            {note}
          </span>
        </span>
      </div>
    </div>
  );
}

function NoticeRow({ notification }) {
  const config = getTypeConfig(notification.noticeType);
  const tone = TONE_CLASSES[config.tone] || TONE_CLASSES.purple;
  const Icon = config.icon;

  return (
    <article
      className={`card p-4 transition-colors hover:border-brand-line hover:bg-surface ${tone.row}`}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_120px_48px] lg:items-center">
        <Link href={notification.href || "#"} className="min-w-0">
          <div className="flex items-start gap-4">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control ${tone.icon}`}
            >
              <Icon />
            </span>
            <span className="min-w-0">
              <span
                className={`badge badge-neutral inline-flex uppercase ${tone.badge}`}
              >
                {config.badge || config.label}
              </span>
              <h3 className="mt-2 line-clamp-1 font-semibold text-ink">
                {notification.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {notification.message}
              </p>
              <span className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
                <span>
                  {notification.noticeType === "EVENT"
                    ? "Event Team"
                    : notification.noticeType === "MAGAZINE"
                      ? "Magazine Desk"
                      : "Super Admin"}
                </span>
                <span><AppDate value={notification.publishedAt} mode="dateTime" /></span>
                {notification.event?.title && <span>{notification.event.title}</span>}
              </span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 lg:justify-center">
          <span
            className={`h-2 w-2 rounded-full ${
              notification.isRead ? "bg-subtle" : "bg-danger"
            }`}
          />
          <span
            className={`text-xs font-semibold ${
              notification.isRead ? "text-muted" : "text-danger"
            }`}
          >
            {notification.isRead ? "Read" : "Unread"}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href={notification.href || "#"}
            className="btn-icon btn-ghost inline-flex items-center justify-center transition-colors"
            title="View notice"
          >
            <FaEye />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function SchoolNoticeBoard() {
  // Remembered until the page is refreshed.
  const [activeType, setActiveType] = useRememberedState("notice-board:type", "ALL");
  const [statusFilter, setStatusFilter] = useRememberedState("notice-board:status", "ALL");

  const {
    loading,
    error,
    notifications,
    loadNotifications,
  } = useNotificationInbox({
    listUrl: "/api/school/notifications",
    readUrl: "/api/school/notifications/read",
    limit: 100,
    realtimeChannel: "school-notifications",
    markVisibleOnLoad: true,
  });

  const counts = useMemo(
    () => ({
      all: notifications.length,
      platform: notifications.filter((item) => item.noticeType === "GENERAL").length,
      event: notifications.filter((item) => item.noticeType === "EVENT").length,
      magazine: notifications.filter((item) => item.noticeType === "MAGAZINE").length,
      unread: notifications.filter((item) => !item.isRead).length,
    }),
    [notifications]
  );

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        const matchesType =
          activeType === "ALL" || notification.noticeType === activeType;
        const matchesStatus =
          statusFilter === "ALL" ||
          (statusFilter === "UNREAD" && !notification.isRead) ||
          (statusFilter === "READ" && notification.isRead);
        return matchesType && matchesStatus;
      }),
    [activeType, notifications, statusFilter]
  );

  const todayNotices = filteredNotifications.filter((item) =>
    isToday(item.publishedAt)
  );
  const earlierNotices = filteredNotifications.filter(
    (item) => !isToday(item.publishedAt)
  );

  const tabs = [
    ["ALL", "All Notices", FaClipboardList],
    ["GENERAL", "Platform", FaDesktop],
    ["EVENT", "Event", FaBullhorn],
    ["MAGAZINE", "Magazine", FaBookOpen],
  ];

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-soft text-xl text-brand-strong">
              <FaBell />
            </span>
            <div>
              <h2 className="font-semibold text-ink">
                Received Notices
              </h2>
              <p className="mt-2 max-w-2xl text-base text-muted">
                View platform updates, event notices, and magazine alerts sent to
                your school dashboard.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="btn btn-primary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaSyncAlt />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <NoticeMetric
          icon={FaEnvelope}
          value={counts.all}
          label="Total Notices"
          note="All categories"
          tone="purple"
        />
        <NoticeMetric
          icon={FaDesktop}
          value={counts.platform}
          label="Platform Notices"
          note="New updates"
          tone="blue"
        />
        <NoticeMetric
          icon={FaBullhorn}
          value={counts.event}
          label="Event Notices"
          note="Competitions & rounds"
          tone="rose"
        />
        <NoticeMetric
          icon={FaBookOpen}
          value={counts.magazine}
          label="Magazine Notices"
          note="Submissions & reviews"
          tone="amber"
        />
        <NoticeMetric
          icon={FaCheckCircle}
          value={counts.unread}
          label="Unread"
          note="Requires your attention"
          tone="emerald"
        />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map(([key, label, Icon]) => {
              const active = activeType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveType(key)}
                  className={`btn btn-ghost inline-flex items-center gap-2 transition-colors ${
                    active
                      ? "bg-brand-soft text-brand-strong"
                      : "text-ink hover:bg-surface hover:text-brand-strong"
                  }`}
                >
                  <Icon />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input transition-colors"
            >
              <option value="ALL">All Status</option>
              <option value="UNREAD">Unread</option>
              <option value="READ">Read</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setActiveType("ALL");
                setStatusFilter("ALL");
              }}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FaFilter />
              Clear
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <LoadingState
              title="Loading received notices"
              message="Preparing platform, event, and magazine updates."
            />
          ) : error ? (
            <EmptyState
              icon={FaBell}
              title="Unable to load notices"
              description={error}
            />
          ) : filteredNotifications.length === 0 ? (
            <EmptyState
              icon={FaBell}
              title="No received notices found"
              description="New platform, event, and magazine updates will appear here automatically."
            />
          ) : (
            <div className="space-y-4">
              {todayNotices.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold uppercase text-muted">
                    Today
                  </h3>
                  <div className="space-y-3">
                    {todayNotices.map((notification) => (
                      <NoticeRow
                        key={`${notification.noticeType}-${notification.id}`}
                        notification={notification}
                      />
                    ))}
                  </div>
                </div>
              )}

              {earlierNotices.length > 0 && (
                <div>
                  <h3 className="mb-3 font-semibold uppercase text-muted">
                    Earlier
                  </h3>
                  <div className="space-y-3">
                    {earlierNotices.map((notification) => (
                      <NoticeRow
                        key={`${notification.noticeType}-${notification.id}`}
                        notification={notification}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
