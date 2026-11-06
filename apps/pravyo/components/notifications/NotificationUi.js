"use client";

import { BookOpen as FaBookOpen, Megaphone as FaBullhorn, CalendarDays as FaCalendarAlt, MessageSquareText as FaCommentDots, ArrowLeftRight as FaExchangeAlt, Presentation as FaPresentation, School as FaSchool, Trophy as FaTrophy } from "lucide-react";

// Per-type visual identity (icon + colored avatar) so each category is instantly
// scannable, the way Instagram/Facebook colour-code notification kinds.
export const NOTIFICATION_TYPES = {
  MESSAGE: {
    label: "Message",
    Icon: FaCommentDots,
    circle: "bg-success-soft text-success",
  },
  NOTICE: {
    label: "Notice",
    Icon: FaBullhorn,
    circle: "bg-warning-soft text-warning",
  },
  CONSENT: {
    label: "Consent",
    Icon: FaBookOpen,
    circle: "bg-warning-soft text-warning",
  },
  ACHIEVEMENT: {
    label: "Achievement",
    Icon: FaTrophy,
    circle: "bg-warning-soft text-warning",
  },
  MAGAZINE: {
    label: "Magazine",
    Icon: FaBookOpen,
    circle: "bg-brand-soft text-brand-strong",
  },
  TRANSFER: {
    label: "Transfer",
    Icon: FaExchangeAlt,
    circle: "bg-brand-soft text-brand-strong",
  },
  EVENT: {
    label: "Event",
    Icon: FaCalendarAlt,
    circle: "bg-brand-soft text-brand-strong",
  },
  TRAINING: {
    label: "Training",
    Icon: FaPresentation,
    circle: "bg-success-soft text-success",
  },
  GENERAL: {
    label: "Platform",
    Icon: FaBullhorn,
    circle: "bg-surface-2 text-muted",
  },
  SCHOOL: {
    label: "School",
    Icon: FaSchool,
    circle: "bg-success-soft text-success",
  },
};

export function getNotificationType(noticeType) {
  return NOTIFICATION_TYPES[noticeType] || NOTIFICATION_TYPES.SCHOOL;
}

// Compact relative time ("now", "5m", "3h", "2d", "1w") falling back to a date.
export function formatRelativeTime(value) {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";

  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Buckets the feed into Today / This Week / Earlier sections (FB-style).
export function groupNotificationsByTime(notifications = []) {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;

  const today = [];
  const week = [];
  const earlier = [];

  for (const item of notifications) {
    const t = new Date(item.publishedAt || 0).getTime();
    if (t >= startOfToday) today.push(item);
    else if (t >= weekAgo) week.push(item);
    else earlier.push(item);
  }

  return [
    { key: "today", label: "Today", items: today },
    { key: "week", label: "This Week", items: week },
    { key: "earlier", label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

// ── Legacy exports (still used by the full notices pages) ─────────────────────

export function getNotificationTypeLabel(noticeType, { detailed = false } = {}) {
  if (noticeType === "EVENT") return detailed ? "Event Notice" : "Event";
  if (noticeType === "MAGAZINE") return detailed ? "Magazine Notice" : "Magazine";
  if (noticeType === "ACHIEVEMENT") return detailed ? "Achievement" : "Achievement";
  if (noticeType === "TRANSFER") return detailed ? "Transfer Notice" : "Transfer";
  if (noticeType === "TRAINING") return detailed ? "Training" : "Training";
  if (noticeType === "GENERAL") return detailed ? "Platform Notice" : "Platform";
  return detailed ? "School Notice" : "School";
}

export function NotificationTypeBadge({ noticeType, detailed = false }) {
  return (
    <span className="badge badge-danger inline-flex uppercase tracking-wide">
      {getNotificationTypeLabel(noticeType, { detailed })}
    </span>
  );
}

export function NotificationNewBadge({ isRead }) {
  if (isRead) return null;
  return (
    <span className="badge badge-danger inline-flex font-semibold uppercase tracking-wide">
      New
    </span>
  );
}

