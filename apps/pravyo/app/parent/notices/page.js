"use client";

import {
  useParentApp,
  useParentResource,
} from "@/components/parent/ParentAppContext";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ParentEmptyState from "@/components/parent/ParentEmptyState";
import DateTile from "@/components/common/DateTile";
import { formatParentDate } from "@/lib/parentFormat";
import Glyph from "@/components/ui/Glyph";

/**
 * The Parent Notice Centre (§11), in three sections:
 *   🔴 Action Required · 🟡 Unread · 🟢 Read
 *
 * Rendering this list does NOT mark anything read. The server records delivery
 * only; `openedAt` is written when the parent opens a notice's detail page.
 * Nothing on this screen should ever call the respond endpoint.
 */
export default function ParentNoticesPage() {
  const { t, selectedChildId, preferences, simpleMode } = useParentApp();
  const { loading, error, data, reload } = useParentResource(
    "/api/parent/notices"
  );

  if (!selectedChildId) return null;

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <ParentEmptyState
        emoji="⚠️"
        tone="neutral"
        title={error || t("common.somethingWrong")}
        action={
          <button
            type="button"
            onClick={reload}
            className="btn btn-primary"
          >
            {t("common.retry")}
          </button>
        }
      />
    );
  }

  const { sections } = data;
  const total =
    sections.actionRequired.length +
    sections.unread.length +
    sections.read.length;

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-ink">
        {t("notices.title")}
      </h1>

      {total === 0 ? (
        <ParentEmptyState emoji="✓" title={t("notices.empty")} />
      ) : (
        <>
          <NoticeSection
            title={t("notices.actionRequired")}
            emoji="🔴"
            notices={sections.actionRequired}
            calendar={preferences.calendarPreference}
            t={t}
            simpleMode={simpleMode}
            action
          />
          <NoticeSection
            title={t("notices.unread")}
            emoji="🟡"
            notices={sections.unread}
            calendar={preferences.calendarPreference}
            t={t}
            simpleMode={simpleMode}
          />
          <NoticeSection
            title={t("notices.read")}
            emoji="🟢"
            notices={sections.read}
            calendar={preferences.calendarPreference}
            t={t}
            simpleMode={simpleMode}
            muted
          />
        </>
      )}
    </div>
  );
}

/**
 * One section of the Notice Centre, laid out like the school and student
 * notice boards: a date tile in the parent's calendar, the title and preview,
 * and "Open →" on the right. The whole row opens the notice.
 */
function NoticeSection({ title, emoji, notices, calendar, t, simpleMode, action = false, muted = false }) {
  if (notices.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide text-muted">
        <Glyph emoji={emoji} />
        {title}
        <span className="badge badge-neutral text-xs">
          {notices.length}
        </span>
      </h2>

      <ul className="card divide-y divide-line overflow-hidden">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link
              href={`/parent/notices/${notice.id}`}
              className={`relative flex items-center gap-3.5 p-4 transition-colors hover:bg-surface-2 ${
                action ? "bg-danger-soft/40" : muted ? "" : "bg-brand-soft/40"
              }`}
            >
              {action && <span className="absolute inset-y-0 left-0 w-1 bg-danger" aria-hidden />}
              {!action && !muted && <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />}
              {notice.publishedAt && (
                <DateTile value={notice.publishedAt} calendar={calendar} tone={action ? "danger" : muted ? "muted" : "brand"} />
              )}
              <span className="min-w-0 flex-1">
                {notice.requiresConsent && (
                  <span className="badge badge-warning mb-1">📝 {t("notices.actionRequired")}</span>
                )}
                <span className={`block font-semibold ${muted ? "text-body" : "text-ink"} ${simpleMode ? "" : "line-clamp-1"}`}>
                  {notice.title}
                </span>
                {notice.preview && !simpleMode && (
                  <span className="mt-0.5 block line-clamp-2 text-sm text-muted">{notice.preview}</span>
                )}
                <span className={`mt-1.5 block text-xs ${notice.actionDeadline ? "font-semibold text-danger" : "text-muted"}`}>
                  {notice.actionDeadline
                    ? t("notices.deadline", { date: formatParentDate(notice.actionDeadline, { calendar }) })
                    : formatParentDate(notice.publishedAt, { calendar })}
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-brand">
                {t("home.open")} <ArrowRight aria-hidden className="h-4 w-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
