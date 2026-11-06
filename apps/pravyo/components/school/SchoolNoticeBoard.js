"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import {
  Bell as FaBell,
  BookOpen as FaBookOpen,
  Monitor as FaDesktop,
  Megaphone as FaBullhorn,
  RefreshCw as FaSyncAlt,
  Search as FaSearch,
  ArrowRight,
  X,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import DateTile from "@/components/common/DateTile";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import useNotificationInbox from "@/lib/client/useNotificationInbox";
import { formatRelativeDateTime } from "@/lib/nepaliDate";

/**
 * Received Notices — what Praavyo, event organisers and the magazine desk
 * send to the school. Read-only, laid out like the school's own Student
 * Notices board: a date tile per notice, filters in one bar, no figures row.
 */
const TYPES = {
  GENERAL: { label: "Platform", from: "Praavyo", icon: FaDesktop, badge: "badge-brand", open: "Open" },
  EVENT: { label: "Event", from: "Event team", icon: FaBullhorn, badge: "badge-danger", open: "Open event" },
  MAGAZINE: { label: "Magazine", from: "Magazine desk", icon: FaBookOpen, badge: "badge-warning", open: "Open magazine" },
};
const typeOf = (value) => TYPES[value] || TYPES.GENERAL;

export default function SchoolNoticeBoard() {
  const { calendar } = useCalendarPreference();
  const nepali = calendar === "BS";
  // Remembered until the page is refreshed.
  const [activeType, setActiveType] = useRememberedState("notice-board:type", "ALL");
  const [statusFilter, setStatusFilter] = useRememberedState("notice-board:status", "ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const { loading, error, notifications, loadNotifications } = useNotificationInbox({
    listUrl: "/api/school/notifications",
    readUrl: "/api/school/notifications/read",
    limit: 100,
    realtimeChannel: "school-notifications",
    markVisibleOnLoad: true,
  });

  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      notifications.filter((notification) => {
        if (activeType !== "ALL" && notification.noticeType !== activeType) return false;
        if (statusFilter === "UNREAD" && notification.isRead) return false;
        if (statusFilter === "READ" && !notification.isRead) return false;
        if (!query) return true;
        return `${notification.title} ${notification.message} ${notification.event?.title || ""}`
          .toLowerCase()
          .includes(query);
      }),
    [activeType, notifications, query, statusFilter]
  );
  const unread = notifications.filter((notification) => !notification.isRead).length;
  const filtersActive = activeType !== "ALL" || Boolean(query);

  const toggle = (key) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
            <FaBell aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">Received Notices</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              Updates sent to your school from Praavyo, event organisers and the magazine desk.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void loadNotifications()} className="btn btn-secondary">
          <FaSyncAlt aria-hidden /> Refresh
        </button>
      </div>

      {/* Toolbar */}
      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="tabs shrink-0" role="tablist" aria-label="Read status">
          {[
            ["ALL", "All"],
            ["UNREAD", unread ? `Unread · ${unread}` : "Unread"],
            ["READ", "Read"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={statusFilter === value}
              onClick={() => setStatusFilter(value)}
              className="tab"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or message"
            aria-label="Search received notices"
            className="input w-full pl-9"
          />
        </div>
        <select
          value={activeType}
          onChange={(event) => setActiveType(event.target.value)}
          aria-label="Type"
          className="input lg:w-40"
        >
          <option value="ALL">All types</option>
          {Object.entries(TYPES).map(([value, type]) => (
            <option key={value} value={value}>{type.label}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setActiveType("ALL");
              setSearch("");
            }}
            className="btn btn-ghost btn-sm self-start lg:self-auto"
          >
            <X aria-hidden /> Clear
          </button>
        )}
      </div>

      {/* List */}
      <section className="card overflow-hidden" aria-label="Received notices">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">
            {statusFilter === "UNREAD" ? "Unread" : statusFilter === "READ" ? "Read" : "All notices"}
            <span className="ml-1.5 font-normal text-muted tabular-nums">{visible.length}</span>
          </h3>
          <span className="text-xs text-muted">Newest first</span>
        </div>

        {loading ? (
          <div className="divide-y divide-line">
            {[1, 2, 3].map((index) => (
              <div key={index} className="flex gap-4 p-4">
                <div className="skeleton h-[4.5rem] w-14" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="skeleton h-4 w-1/2" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <EmptyState icon={FaBell} title="Unable to load notices" description={error} />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FaBell}
              title={filtersActive || statusFilter !== "ALL" ? "No notices match" : "No notices yet"}
              description={
                filtersActive || statusFilter !== "ALL"
                  ? "Try another search, or clear the filters."
                  : "Platform, event and magazine updates appear here as soon as they are sent."
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((notification) => {
              const key = `${notification.noticeType}-${notification.id}`;
              const type = typeOf(notification.noticeType);
              const open = expanded.has(key);
              const hasLink = notification.href && notification.href !== "#";
              return (
                <li
                  key={key}
                  className={`relative flex gap-3.5 p-4 transition-colors hover:bg-surface-2 sm:gap-4 ${
                    notification.isRead ? "" : "bg-brand-soft/40"
                  }`}
                >
                  {!notification.isRead && <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />}
                  {notification.publishedAt && <DateTile value={notification.publishedAt} />}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${type.badge}`}><type.icon /> {type.label}</span>
                      {!notification.isRead && <span className="badge badge-brand">New</span>}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-expanded={open}
                      className="mt-1 block w-full text-left"
                    >
                      <h4 className={`text-base font-semibold text-ink hover:text-brand-strong ${open ? "" : "line-clamp-1"}`}>
                        {notification.title}
                      </h4>
                      <p className={`mt-0.5 whitespace-pre-wrap text-sm text-muted ${open ? "" : "line-clamp-2"}`}>
                        {notification.message}
                      </p>
                    </button>

                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span lang={nepali ? "ne" : undefined}>{formatRelativeDateTime(notification.publishedAt, calendar)}</span>
                      <span aria-hidden>·</span>
                      <span>{type.from}</span>
                      {notification.event?.title && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-ink">{notification.event.title}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {hasLink && (
                    <Link
                      href={notification.href}
                      className="inline-flex shrink-0 items-center gap-1 self-center whitespace-nowrap text-sm font-semibold text-brand hover:text-brand-strong hover:underline"
                    >
                      {type.open} <ArrowRight aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
