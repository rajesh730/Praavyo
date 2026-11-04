"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { BadgeCheck, ChevronLeft, ChevronRight, Printer, Search, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import AppDate from "@/components/common/AppDate";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import SearchSelect from "@/components/ui/SearchSelect";

/**
 * The school's certificate register: every certificate it has issued, as a
 * table, narrowed by academic year → type → the competition or program →
 * award → grade, plus a name or code search. "Basketball competition of
 * 2081 BS" is: Year 2081 BS, Event Basketball competition.
 *
 * Filters are remembered until the page is refreshed. The visible rows can
 * be printed together (the bulk print page takes up to 80 at a time).
 */

const PAGE_SIZE = 25;
const PRINT_BATCH = 80;

const TYPES = [
  { id: "", label: "All types" },
  { id: "COMPETITION", label: "Competitions" },
  { id: "PROGRAM", label: "Performance programs" },
];

const AWARD_ORDER = ["WINNER", "RUNNER_UP", "THIRD_PLACE", "FINALIST", "MERIT", "SPECIAL_MENTION", "PARTICIPANT"];
const AWARD_TONE = {
  WINNER: "badge-warning",
  RUNNER_UP: "badge-brand",
  THIRD_PLACE: "badge-brand",
  FINALIST: "badge-success",
  MERIT: "badge-success",
  SPECIAL_MENTION: "badge-success",
  PARTICIPANT: "badge-neutral",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const gradeSort = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/** Name search: the start of any word ("ri" → Riyan Shrestha); codes match anywhere. */
function matches(row, term) {
  if (!term) return true;
  const t = term.toLowerCase();
  const words = `${row.recipient} ${row.sourceTitle} ${row.performanceTitle}`.toLowerCase().split(/\s+/);
  if (words.some((word) => word.startsWith(t))) return true;
  if (`${row.recipient}`.toLowerCase().startsWith(t)) return true;
  return row.code.toLowerCase().includes(t);
}

export default function SchoolCertificatesPage() {
  const { data: session, status } = useSession();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [year, setYear] = useRememberedState("certificates:year", "");
  const [type, setType] = useRememberedState("certificates:type", "");
  const [source, setSource] = useRememberedState("certificates:source", "");
  const [award, setAward] = useRememberedState("certificates:award", "");
  const [grade, setGrade] = useRememberedState("certificates:grade", "");
  const [query, setQuery] = useRememberedState("certificates:query", "");
  const [page, setPage] = useState(0);

  const isSchool = status === "authenticated" && session?.user?.role === "SCHOOL_ADMIN";
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isSchool) return undefined;
    let live = true;
    fetch("/api/school/certificates", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "Certificates could not load.");
        if (live) setRows(payload.certificates || []);
      })
      .catch((loadError) => live && setError(loadError.message || "Certificates could not load."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [isSchool, reloadKey]);

  const retry = () => {
    setLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  };
  // Still waiting: the session, or (for a school) the first load.
  const waiting = status === "loading" || (isSchool && loading);

  // ----- filter options, each narrowed by the filters before it -----
  const years = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => map.set(String(row.yearStart), row.yearLabel));
    return [...map.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
  }, [rows]);

  const inYearAndType = useMemo(
    () => rows.filter((row) => (!year || String(row.yearStart) === year) && (!type || row.kind === type)),
    [rows, year, type]
  );

  const sources = useMemo(() => {
    const map = new Map();
    inYearAndType.forEach((row) => {
      const key = row.sourceId || row.sourceTitle;
      const entry = map.get(key) || { key, title: row.sourceTitle, kind: row.kind, count: 0, date: row.eventDate };
      entry.count += 1;
      map.set(key, entry);
    });
    return [...map.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [inYearAndType]);

  const sourceValid = !source || sources.some((s) => s.key === source);
  const activeSource = sourceValid ? source : "";

  const inSource = useMemo(
    () => inYearAndType.filter((row) => !activeSource || (row.sourceId || row.sourceTitle) === activeSource),
    [inYearAndType, activeSource]
  );
  const awards = useMemo(() => {
    const present = new Map(inSource.map((row) => [row.placement, row.placementLabel]));
    return AWARD_ORDER.filter((key) => present.has(key)).map((key) => [key, present.get(key)]);
  }, [inSource]);
  const grades = useMemo(() => [...new Set(inSource.map((row) => row.grade).filter(Boolean))].sort(gradeSort), [inSource]);

  const visible = useMemo(() => {
    const term = query.trim();
    return inSource.filter(
      (row) => (!award || row.placement === award) && (!grade || row.grade === grade) && matches(row, term)
    );
  }, [inSource, award, grade, query]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const filtersOn = Boolean(year || type || activeSource || award || grade || query.trim());
  const reset = (fn) => (value) => {
    fn(value);
    setPage(0);
  };
  const clearAll = () => {
    setYear("");
    setType("");
    setSource("");
    setAward("");
    setGrade("");
    setQuery("");
    setPage(0);
  };

  const batches = [];
  for (let i = 0; i < visible.length; i += PRINT_BATCH) batches.push(visible.slice(i, i + PRINT_BATCH));

  return (
    <DashboardLayout>
      <PageHeader
        icon={BadgeCheck}
        eyebrow="Recognition"
        title="Certificates"
        description="Every certificate your school has issued, for competitions and performance programs. Filter by year, event, award or grade."
      />

      {!waiting && !isSchool ? (
        <div className="mt-5">
          <AlertBanner type="error" title="School administrator access required" message="Only a school administrator can view the school's certificate register." />
        </div>
      ) : waiting ? (
        <div className="mt-5"><LoadingState title="Loading certificates" message="Preparing the certificate register." /></div>
      ) : error ? (
        <div className="mt-5"><EmptyState title="Certificates unavailable" description={error} actionLabel="Try again" onAction={retry} /></div>
      ) : rows.length === 0 ? (
        <div className="mt-5"><EmptyState title="No certificates yet" description="Certificates appear here as soon as a competition or performance program publishes its result." /></div>
      ) : (
        <section className="mt-5 space-y-4">
          {/* filters */}
          <div className="card p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Filter label="Academic year">
                <select className="input" value={year} onChange={(e) => { reset(setYear)(e.target.value); setSource(""); }}>
                  <option value="">All years</option>
                  {years.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Filter>
              <Filter label="Type">
                <select className="input" value={type} onChange={(e) => { reset(setType)(e.target.value); setSource(""); }}>
                  {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Filter>
              <Filter label="Competition / program" wide>
                <SearchSelect
                  ariaLabel="Competition or program"
                  value={activeSource}
                  onChange={reset(setSource)}
                  allLabel={`All (${sources.length})`}
                  placeholder="Type a competition or program name…"
                  options={sources.map((source) => ({
                    value: source.key,
                    label: source.title,
                    hint: `${source.kind === "PROGRAM" ? "Program" : "Competition"} · ${source.count}`,
                  }))}
                />
              </Filter>
              <Filter label="Award">
                <select className="input" value={award} onChange={(e) => reset(setAward)(e.target.value)}>
                  <option value="">All awards</option>
                  {awards.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Filter>
              <Filter label="Grade">
                <select className="input" value={grade} onChange={(e) => reset(setGrade)(e.target.value)}>
                  <option value="">All grades</option>
                  {grades.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Filter>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Search by name or certificate code</span>
                <Search aria-hidden size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input w-full pl-9" value={query} onChange={(e) => reset(setQuery)(e.target.value)}
                  placeholder="Type the start of a student's name, or a certificate code" />
              </label>
              {filtersOn && (
                <button type="button" onClick={clearAll} className="btn btn-ghost inline-flex items-center justify-center gap-1">
                  <X aria-hidden size={15} /> Clear filters
                </button>
              )}
            </div>
          </div>

          {/* results */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="text-sm text-ink">
                <span className="font-bold">{plural(visible.length, "certificate")}</span>
                {visible.length > PAGE_SIZE && (
                  <span className="text-muted"> · showing {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + shown.length}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {batches.slice(0, 3).map((batch, index) => (
                  <a key={index} href={`/certificates/bulk?ids=${batch.map((row) => row._id).join(",")}`} target="_blank" rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm inline-flex items-center gap-1">
                    <Printer aria-hidden size={14} />
                    {batches.length === 1 ? "Print all shown" : `Print ${index * PRINT_BATCH + 1}–${index * PRINT_BATCH + batch.length}`}
                  </a>
                ))}
                {batches.length > 3 && <span className="self-center text-xs text-muted">Narrow the filters to print the rest.</span>}
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No certificates match" description="Try another year, event or award, or clear the filters." actionLabel="Clear filters" onAction={clearAll} />
              </div>
            ) : (
              <>
                {/* wide screens: the table */}
                <table className="hidden w-full text-left text-sm md:table">
                  <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="w-12 px-4 py-3">#</th>
                      <th scope="col" className="px-4 py-3">Student</th>
                      <th scope="col" className="px-4 py-3">Grade</th>
                      <th scope="col" className="px-4 py-3">Competition / program</th>
                      <th scope="col" className="px-4 py-3">Award</th>
                      <th scope="col" className="px-4 py-3">Year</th>
                      <th scope="col" className="px-4 py-3">Issued</th>
                      <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Certificate</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((row, index) => (
                      <tr key={row._id} className="align-top hover:bg-surface-2">
                        <td className="px-4 py-3 tabular-nums text-muted">{current * PAGE_SIZE + index + 1}</td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-ink">{row.recipient}</span>
                          {row.isTeam && <span className="text-xs text-muted">Team</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink">
                          {row.grade || "—"}{row.section ? <span className="text-muted"> · {row.section}</span> : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-ink">{row.sourceTitle}</span>
                          <span className="block text-xs text-muted">
                            {row.kind === "PROGRAM" ? "Performance program" : "Competition"}
                            {row.performanceTitle ? ` · ${row.performanceTitle}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge ${AWARD_TONE[row.placement] || "badge-neutral"} whitespace-nowrap text-xs`}>{row.placementLabel}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink">{row.yearLabel}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="block text-ink"><AppDate value={row.issuedAt} /></span>
                          {row.code && <span className="block font-mono text-2xs text-muted">{row.code}</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={row.url} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm inline-flex items-center gap-1 whitespace-nowrap">
                            <BadgeCheck aria-hidden size={14} /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* phones: the same rows, stacked */}
                <ul className="divide-y divide-line md:hidden">
                  {shown.map((row) => (
                    <li key={row._id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{row.recipient}</p>
                          <p className="text-xs text-muted">{[row.grade, row.section].filter(Boolean).join(" · ") || (row.isTeam ? "Team" : "")}</p>
                        </div>
                        <span className={`badge ${AWARD_TONE[row.placement] || "badge-neutral"} shrink-0 text-xs`}>{row.placementLabel}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-ink">{row.sourceTitle}</p>
                      <p className="text-xs text-muted">
                        {row.kind === "PROGRAM" ? "Performance program" : "Competition"}
                        {row.performanceTitle ? ` · ${row.performanceTitle}` : ""} · {row.yearLabel}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted">Issued <AppDate value={row.issuedAt} /></span>
                        <Link href={row.url} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm inline-flex min-h-10 items-center gap-1">
                          <BadgeCheck aria-hidden size={14} /> View certificate
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>

                {pages > 1 && (
                  <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                    <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
                      <ChevronLeft aria-hidden size={14} /> Previous
                    </button>
                    <span className="text-sm text-muted">Page {current + 1} of {pages}</span>
                    <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="btn btn-secondary btn-sm inline-flex items-center gap-1">
                      Next <ChevronRight aria-hidden size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </DashboardLayout>
  );
}

function Filter({ label, wide = false, children }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
