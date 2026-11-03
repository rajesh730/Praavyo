"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LineChart, TriangleAlert } from "lucide-react";
import { useParentApp, useParentResource } from "@/components/parent/ParentAppContext";
import ParentEmptyState from "@/components/parent/ParentEmptyState";

/**
 * Results | Progress, at the top of the parent's Learning tab. Results are the
 * published report cards; Progress is the live assessment behind them.
 */
export function LearningSwitch() {
  const pathname = usePathname();
  const { t } = useParentApp();
  const tabs = [
    { href: "/parent/learning/cas", label: t("progress.results") },
    { href: "/parent/learning/progress", label: t("progress.progress") },
  ];
  return (
    <nav className="tabs mb-4 w-fit" aria-label={t("nav.learning")}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`tab ${pathname.startsWith(tab.href) ? "is-active" : ""}`} aria-current={pathname.startsWith(tab.href) ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

const LEVEL_TONE = {
  1: "bg-danger-soft text-danger",
  2: "bg-warning-soft text-warning",
  3: "bg-brand-soft text-brand-strong",
  4: "bg-success-soft text-success",
};

/**
 * The selected child's continuous-assessment progress this year, read-only:
 * every subject they take, each theme's achievement, and the level reached on
 * each learning outcome. Only this guardian's own child (see the API route).
 */
export default function ChildProgress() {
  const { t, selectedChild, selectedChildId } = useParentApp();
  const { loading, error, data, reload } = useParentResource("/api/parent/progress");
  const lang = t.locale === "ne" ? "ne" : "en";
  const pick = (en, ne) => (lang === "ne" && ne ? ne : en);

  if (!selectedChildId) return null;

  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <LearningSwitch />
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">{t("progress.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("progress.intro", { name: selectedChild?.name || "" })}</p>
      </header>

      {loading ? (
        <div className="h-72 animate-pulse rounded-card bg-surface-2" />
      ) : error || !data ? (
        <ParentEmptyState
          icon={TriangleAlert}
          tone="neutral"
          title={error || t("common.somethingWrong")}
          action={<button type="button" onClick={reload} className="btn btn-primary">{t("common.retry")}</button>}
        />
      ) : !data.available ? (
        <ParentEmptyState
          icon={LineChart}
          tone="neutral"
          title={data.reason === "NOT_CAS_GRADE" ? t("progress.notCas", { grade: data.grade || "" }) : t("progress.unavailable")}
        />
      ) : !data.subjects.some((subject) => subject.totals?.assessedCount) ? (
        <ParentEmptyState icon={LineChart} tone="neutral" title={t("progress.empty")} />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{t("progress.levels")}</p>
          <div className="space-y-3">
            {data.subjects.map((subject) => (
              <SubjectCard key={subject.subject.id} subject={subject} pick={pick} t={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SubjectCard({ subject, pick, t }) {
  const [open, setOpen] = useState(false);
  const totals = subject.totals || {};
  return (
    <article className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{pick(subject.subject.titleEn, subject.subject.titleNe)}</span>
          <span className="block text-sm text-muted">
            {totals.assessedCount
              ? t("progress.assessed", { assessed: totals.assessedCount, total: totals.outcomeCount })
              : t("progress.notYet")}
          </span>
        </span>
        {totals.percent != null && (
          <span className="text-right">
            <span className="block text-lg font-semibold text-ink">{totals.grade}</span>
            <span className="block text-xs text-muted">{totals.percent}%</span>
          </span>
        )}
        <ChevronDown aria-hidden size={18} className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="divide-y divide-line border-t border-line">
          {subject.themes.map((theme) => (
            <div key={theme.key} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-ink">{pick(theme.titleEn, theme.titleNe)}</p>
                <span className="shrink-0 text-sm text-muted">
                  {theme.totals?.percent != null ? `${theme.totals.grade} · ${theme.totals.percent}%` : t("progress.notYet")}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {theme.outcomes.map((outcome) => (
                  <li key={outcome.code || outcome.titleEn} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 inline-grid h-6 min-w-6 shrink-0 place-items-center rounded-control px-1 text-xs font-bold ${outcome.level ? LEVEL_TONE[outcome.level] : "bg-surface-2 text-subtle"}`}>
                      {outcome.level || "–"}
                    </span>
                    <span className="text-body">{pick(outcome.titleEn, outcome.titleNe)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
