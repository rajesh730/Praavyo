"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck as FaCheckCircle, ExternalLink as FaExternalLinkAlt, TriangleAlert, Trophy, PenLine, ScrollText, UserRound } from "lucide-react";
import {
  useParentApp,
  useParentResource,
} from "@/components/parent/ParentAppContext";
import ChildAvatar from "@/components/parent/ChildAvatar";
import ParentEmptyState from "@/components/parent/ParentEmptyState";
import WritingReader from "@/components/parent/WritingReader";
import { formatParentDate } from "@/lib/parentFormat";
import Glyph from "@/components/ui/Glyph";
import { academicYearDisplayLabel, academicYearInCalendar } from "@pravyo/core/nepaliDate";

/**
 * "My Child" — the complete portfolio (§18).
 *
 * Tabbed rather than one long scroll, because the four collections answer
 * different questions and a parent usually arrives wanting one of them.
 *
 * What is deliberately absent: anything internal to the school. No disciplinary
 * record, no teacher notes, no administrative flags. The API does not return
 * them, and this screen has nowhere to put them (§18).
 */

// Short labels with an icon each, so all four fit a phone in one row.
const TABS = [
  { key: "profile", labelKey: "child.profile", icon: UserRound },
  { key: "achievements", labelKey: "child.achievements", icon: Trophy },
  { key: "writing", labelKey: "child.writingShort", icon: PenLine },
  { key: "certificates", labelKey: "child.certificates", icon: ScrollText },
];

// `?tab=certificates` opens that tab directly — where a "certificate is
// ready" notification lands.
export default function ParentChildPage() {
  return (
    <Suspense fallback={null}>
      <ParentChildPortfolio />
    </Suspense>
  );
}

function ParentChildPortfolio() {
  const { t, selectedChildId, preferences } = useParentApp();
  const { loading, error, data, reload } = useParentResource(
    "/api/parent/portfolio"
  );

  const requestedTab = useSearchParams().get("tab");
  const [tab, setTab] = useState(
    TABS.some((entry) => entry.key === requestedTab) ? requestedTab : "profile"
  );
  const [openWritingId, setOpenWritingId] = useState(null);

  if (!selectedChildId) return null;

  if (loading) {
    return <div className="h-72 animate-pulse rounded-card bg-surface-2" />;
  }

  if (error || !data) {
    return (
      <ParentEmptyState
        icon={TriangleAlert}
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

  const { child, achievements, writings, certificates, schoolsAttended } = data;
  const calendar = preferences.calendarPreference;
  const name = child.name;

  return (
    <div className="space-y-4">
      <header className="card flex flex-col items-center p-4 text-center">
        <ChildAvatar name={child.name} photoUrl={child.photoUrl} size={88} />
        <h1 className="mt-3 font-semibold text-ink">
          {child.name}
        </h1>
        <p className="text-sm text-muted">
          {child.grade}
          {child.grade && child.school?.name ? " · " : ""}
          {child.school?.name}
        </p>
      </header>

      {/* One full-width segmented control: every section visible, no sideways scroll. */}
      <div role="tablist" aria-label={child.name} className="tabs grid w-full grid-cols-4">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry.key)}
              className={`tab h-auto min-w-0 flex-col justify-center gap-1 px-1 py-2 text-xs ${active ? "text-brand" : ""}`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
              <span className="max-w-full truncate">{t(entry.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {tab === "profile" ? (
        <ProfileTab
          child={child}
          schoolsAttended={schoolsAttended}
          calendar={calendar}
          t={t}
        />
      ) : null}

      {tab === "achievements" ? (
        achievements.length === 0 ? (
          <ParentEmptyState
            icon={Trophy}
            tone="neutral"
            title={t("child.noAchievements", { name })}
          />
        ) : (
          <ul className="space-y-3">
            {achievements.map((achievement) => (
              <li
                key={achievement.id}
                className="card p-4"
              >
                <div className="flex gap-3">
                  <span aria-hidden="true" className="text-2xl">
                    <Glyph emoji={achievement.emoji} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold uppercase tracking-wide text-ink">
                      {achievement.title}
                    </h3>
                    <p className="text-sm font-semibold text-warning">
                      {achievement.placement}
                    </p>
                    {achievement.eventTitle ? (
                      <p className="text-sm text-muted">
                        {achievement.eventTitle}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      {formatParentDate(achievement.date, {
                        calendar,
                        relative: false,
                      })}
                      {" · "}
                      {achievement.schoolName}
                    </p>
                    {achievement.verified ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success">
                        <FaCheckCircle aria-hidden="true" className="h-3.5 w-3.5" />
                        {t("child.verified")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "writing" ? (
        writings.length === 0 ? (
          <ParentEmptyState
            icon={PenLine}
            tone="neutral"
            title={t("child.noWriting", { name })}
          />
        ) : (
          <ul className="space-y-3">
            {writings.map((writing) => (
              <li
                key={writing.id}
                className="card p-4"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="text-2xl">
                    {writing.categoryEmoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                      {t(writing.categoryLabelKey)}
                    </p>
                    <h3 className="font-semibold leading-snug text-ink">
                      {writing.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {writing.preview}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatParentDate(writing.date, {
                        calendar,
                        relative: false,
                      })}
                      {" · "}
                      {writing.schoolName}
                    </p>
                    {writing.teacherReviewed ? (
                      <p className="badge badge-brand mt-1.5 inline-block font-medium">
                        {t("child.teacherReviewed")}
                      </p>
                    ) : null}
                    <WritingStatus writing={writing} t={t} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenWritingId(writing.id)}
                  className="btn btn-primary mt-3 w-full"
                >
                  {t("home.read")}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "certificates" ? (
        certificates.length === 0 ? (
          <ParentEmptyState
            icon={ScrollText}
            tone="neutral"
            title={t("child.noCertificates")}
          />
        ) : (
          <ul className="space-y-3">
            {certificates.map((certificate) => (
              <li
                key={certificate.id}
                className="card p-4"
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="text-2xl">
                    <Glyph emoji="📜" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink">
                      {certificate.title}
                    </h3>
                    {certificate.eventTitle ? (
                      <p className="text-sm text-muted">
                        {certificate.eventTitle}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      {formatParentDate(certificate.issuedAt, {
                        calendar,
                        relative: false,
                      })}
                      {" · "}
                      {certificate.schoolName}
                    </p>
                    {certificate.certificateCode ? (
                      <p className="mt-1 font-mono text-2xs text-muted">
                        {t("child.certificateId")}: {certificate.certificateCode}
                      </p>
                    ) : null}
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success">
                      <FaCheckCircle aria-hidden="true" className="h-3.5 w-3.5" />
                      {t("child.verified")}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  {certificate.certificateUrl ? (
                    <a
                      href={certificate.certificateUrl}
                      className="btn btn-primary flex items-center justify-center gap-2"
                    >
                      {t("child.viewCertificate")}
                    </a>
                  ) : null}
                  {certificate.verifyPath ? (
                    <Link
                      href={certificate.verifyPath}
                      className="btn btn-secondary flex items-center justify-center gap-2"
                    >
                      {t("child.verifyCertificate")}
                      <FaExternalLinkAlt aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {openWritingId ? (
        <WritingReader
          writingId={openWritingId}
          onClose={() => setOpenWritingId(null)}
        />
      ) : null}
    </div>
  );
}

function WritingStatus({ writing, t }) {
  const statusKey = {
    DRAFT: "child.writingDraft",
    SUBMITTED: "child.writingSubmitted",
    APPROVED: "child.writingApproved",
    REJECTED: "child.writingNeedsRevision",
  }[writing.status];

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {statusKey ? (
        <span className="badge badge-neutral font-semibold">
          {t(statusKey)}
        </span>
      ) : null}
      {writing.magazineSelected ? (
        <span className="badge badge-brand font-semibold">
          {writing.magazinePublished
            ? t("child.magazinePublished")
            : t("child.magazineSelected")}
          {writing.magazineIssue?.title
            ? ` · ${writing.magazineIssue.title}`
            : ""}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Profile tab, including "Schools Attended" — the visible proof that the
 * portfolio is portable and that the previous school keeps its credit (§24).
 */
function ProfileTab({ child, schoolsAttended, calendar, t }) {
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <dl className="space-y-2 text-sm">
          <Row label={t("child.gradeLabel")} value={child.grade} />
          <Row label={t("child.rollNumber")} value={child.rollNumber} />
          <Row label={t("child.iemisNumber")} value={child.iemisNumber} mono />
          <Row label={t("child.praavyoId")} value={child.platformStudentId} mono />
          <Row label={t("common.school")} value={child.school?.name} />
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold uppercase tracking-wide text-muted">
          {t("child.schoolsAttended")}
        </h2>
        <ol className="space-y-3">
          {schoolsAttended.map((entry, index) => (
            <li key={`${entry.schoolId}-${index}`} className="flex gap-3">
              <span aria-hidden="true" className="text-lg">
                <Glyph emoji="🏫" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {entry.name}
                </p>
                <p className="text-xs text-muted">
                  {[
                    entry.grade,
                    // In the parent's calendar, like the dates below it
                    // (BS → "२०८३", AD → "2026").
                    entry.academicYearStart != null
                      ? academicYearInCalendar(entry.academicYearStart, calendar)
                      : academicYearDisplayLabel(entry.academicYear, { calendar }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-xs text-muted">
                  {formatParentDate(entry.startedAt, {
                    calendar,
                    relative: false,
                  })}
                  {entry.endedAt
                    ? ` – ${formatParentDate(entry.endedAt, {
                        calendar,
                        relative: false,
                      })}`
                    : ` – ${t("common.present")}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, value, mono = false }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className={`min-w-0 text-right font-semibold text-ink [overflow-wrap:anywhere] ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
