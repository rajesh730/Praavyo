"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { useSearchParams } from "next/navigation";
import { ArrowDown as FaArrowDown, ArrowUp as FaArrowUp, CalendarDays as FaCalendarAlt, ArrowLeftRight as FaExchangeAlt, GraduationCap as FaGraduationCap, LogIn as FaSignInAlt, LogOut as FaSignOutAlt, GraduationCap as FaUserGraduate } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import AppDate from "@/components/common/AppDate";

const JOIN_TYPE = {
  ADMISSION: { label: "Admitted", classes: "bg-success-soft text-success" },
  TRANSFER_IN: { label: "Transferred in", classes: "bg-brand-soft text-brand-strong" },
};
const LEAVE_TYPE = {
  TRANSFERRED: { label: "Transferred out", classes: "bg-brand-soft text-brand-strong" },
  GRADUATED: { label: "Graduated", classes: "bg-surface-2 text-muted" },
};

function CountCard({ icon: Icon, value, label, note, tone = "blue" }) {
  const tones = {
    blue: "bg-brand-soft text-brand-strong border-brand-line",
    emerald: "bg-success-soft text-success border-success-line",
    rose: "bg-danger-soft text-danger border-danger-line",
    purple: "bg-brand-soft text-brand-strong border-brand-line",
  };
  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-4">
        <span className={`flex h-11 w-11 items-center justify-center rounded-control border ${tones[tone]}`}>
          <Icon />
        </span>
        <strong className="text-2xl font-semibold text-ink">{value}</strong>
      </div>
      <p className="mt-4 text-sm font-semibold text-ink">{label}</p>
      {note && <p className="mt-1 text-xs font-semibold text-muted">{note}</p>}
    </div>
  );
}

// Each list scrolls inside its own box, so a school with hundreds of
// admissions or events does not make the whole Overview page endless.
const LIST_BOX = "max-h-[26rem] space-y-2 overflow-y-auto overscroll-contain pr-1";

// Grades are stored as "Grade 5" now and as "5" in older rows.
function gradeLabel(grade) {
  if (!grade) return "";
  return /^grade\b/i.test(String(grade)) ? String(grade) : `Grade ${grade}`;
}

function Chip({ label, classes }) {
  return (
    <span className={`badge badge-neutral uppercase ${classes}`}>
      {label}
    </span>
  );
}

function PersonRow({ name, grade, year, chip }) {
  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-xs font-semibold text-muted">
          {gradeLabel(grade) || "Grade —"}
          {year ? ` · ${year}` : ""}
        </p>
      </div>
      {chip && <Chip label={chip.label} classes={chip.classes} />}
    </div>
  );
}

function TransferRow({ row, direction }) {
  return (
    <div className="card flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{row.studentName}</p>
        <p className="truncate text-xs font-semibold text-muted">
          {direction === "in" ? "From " : "To "}
          {row.counterpartSchool}
          {row.grade ? ` · ${gradeLabel(row.grade)}` : ""}
        </p>
      </div>
      <span className="shrink-0 text-xs font-semibold text-muted">
        <AppDate value={row.date} />
      </span>
    </div>
  );
}

function EmptyLine({ text }) {
  return (
    <p className="rounded-card border border-dashed border-line bg-surface px-4 py-5 text-center text-sm font-semibold text-muted">
      {text}
    </p>
  );
}

function Panel({ id, title, icon: Icon, children, sectionRef }) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className="card scroll-mt-24 p-3"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-2 text-brand">
          <Icon />
        </span>
        <h2 className="font-semibold text-ink">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SchoolAnalytics() {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");

  const [data, setData] = useState(null);
  // The chosen session is remembered until the page is refreshed.
  const [yearStart, setYearStart] = useRememberedState("analytics:year", null);
  const initialYearRef = useRef(yearStart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sectionRefs = {
    students: useRef(null),
    transfers: useRef(null),
    events: useRef(null),
  };

  const load = useCallback(async (selectedYear) => {
    try {
      setLoading(true);
      setError("");
      const query =
        selectedYear !== null && selectedYear !== undefined
          ? `?yearStart=${selectedYear}`
          : "";
      const res = await fetch(`/api/school/analytics${query}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load analytics");
      setData(json.data);
      setYearStart(json.data?.selectedYearStart ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [setYearStart]);

  useEffect(() => {
    load(initialYearRef.current);
  }, [load]);

  // Deep-link: when arriving with ?section=transfers etc., scroll there.
  useEffect(() => {
    if (!sectionParam || loading) return;
    const target = sectionRefs[sectionParam]?.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionParam, loading]);

  if (loading && !data) {
    return (
      <LoadingState
        title="Loading analytics"
        message="Gathering students in/out, transfers, and events."
      />
    );
  }

  if (error) {
    return <AlertBanner type="error" title="Analytics unavailable" message={error} />;
  }

  if (!data || (data.years || []).length === 0) {
    return (
      <AlertBanner
        type="info"
        title="No academic years yet"
        message="Set up your academic year to start tracking students in/out, transfers, and events."
      />
    );
  }

  const summary = data.summary || {};
  const joined = data.joined || [];
  const left = data.left || [];
  const incoming = data.transfers?.incoming || [];
  const outgoing = data.transfers?.outgoing || [];
  const organized = data.events?.organized || [];
  const participated = data.events?.participated || [];

  const cameTotal = joined.length;
  const leftTotal = left.length;

  return (
    <div className="space-y-4">
      {/* Header + year selector */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <h2 className="font-semibold text-ink">
            Academic Year Analysis
          </h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            Who came, who left, transfers, and events for {data.selectedYearLabel}.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted">Session</span>
          <select
            value={yearStart ?? ""}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              setYearStart(next);
              load(next);
            }}
            className="input"
          >
            {data.years.map((y) => (
              <option key={y.yearStart} value={y.yearStart}>
                {y.year}
                {y.status === "ACTIVE" ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Headline cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard
          icon={FaArrowDown}
          value={cameTotal}
          label="Students Came"
          note={`${summary.admitted || 0} admitted · ${summary.transferredIn || 0} transferred in`}
          tone="emerald"
        />
        <CountCard
          icon={FaArrowUp}
          value={leftTotal}
          label="Students Left"
          note={`${summary.transferredOut || 0} transferred out · ${summary.graduated || 0} graduated`}
          tone="rose"
        />
        <CountCard
          icon={FaExchangeAlt}
          value={incoming.length + outgoing.length}
          label="Transfers"
          note={`${incoming.length} in · ${outgoing.length} out`}
          tone="purple"
        />
        <CountCard
          icon={FaCalendarAlt}
          value={organized.length + participated.length}
          label="Events"
          note={`${organized.length} organized · ${participated.length} joined`}
          tone="blue"
        />
      </div>

      {/* Students In / Out */}
      <Panel
        id="students"
        title="Students In / Out"
        icon={FaUserGraduate}
        sectionRef={sectionRefs.students}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
              <FaSignInAlt /> Came in {data.selectedYearLabel} ({joined.length})
            </p>
            <div className={LIST_BOX}>
              {joined.length === 0 ? (
                <EmptyLine text="No new students this session." />
              ) : (
                joined.map((s) => (
                  <PersonRow
                    key={`${s.studentId}-in`}
                    name={s.name}
                    grade={s.grade}
                    year={s.academicYear}
                    chip={JOIN_TYPE[s.type]}
                  />
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-danger">
              <FaSignOutAlt /> Left in {data.selectedYearLabel} ({left.length})
            </p>
            <div className={LIST_BOX}>
              {left.length === 0 ? (
                <EmptyLine text="No students left this session." />
              ) : (
                left.map((s) => (
                  <PersonRow
                    key={`${s.studentId}-out`}
                    name={s.name}
                    grade={s.grade}
                    year={s.academicYear}
                    chip={LEAVE_TYPE[s.type]}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Transfer history */}
      <Panel
        id="transfers"
        title="Student Transfer History"
        icon={FaExchangeAlt}
        sectionRef={sectionRefs.transfers}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <FaSignInAlt /> Incoming ({incoming.length})
            </p>
            <div className={LIST_BOX}>
              {incoming.length === 0 ? (
                <EmptyLine text="No incoming transfers this session." />
              ) : (
                incoming.map((row) => (
                  <TransferRow key={row.id} row={row} direction="in" />
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <FaSignOutAlt /> Outgoing ({outgoing.length})
            </p>
            <div className={LIST_BOX}>
              {outgoing.length === 0 ? (
                <EmptyLine text="No outgoing transfers this session." />
              ) : (
                outgoing.map((row) => (
                  <TransferRow key={row.id} row={row} direction="out" />
                ))
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* Event history */}
      <Panel
        id="events"
        title="Event History"
        icon={FaCalendarAlt}
        sectionRef={sectionRefs.events}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <FaGraduationCap /> Organized ({organized.length})
            </p>
            <div className={LIST_BOX}>
              {organized.length === 0 ? (
                <EmptyLine text="No school events this session." />
              ) : (
                organized.map((e) => (
                  <div
                    key={e.id}
                    className="card flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {e.title}
                      </p>
                      <p className="truncate text-xs font-semibold text-muted">
                        {String(e.status || "").replaceAll("_", " ")}
                        {e.resultsPublished ? " · Results published" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      <AppDate value={e.date} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-strong">
              <FaCalendarAlt /> Participated ({participated.length})
            </p>
            <div className={LIST_BOX}>
              {participated.length === 0 ? (
                <EmptyLine text="No events joined this session." />
              ) : (
                participated.map((e) => (
                  <div
                    key={e.id}
                    className="card flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {e.title}
                      </p>
                      <p className="truncate text-xs font-semibold text-muted">
                        {String(e.scope || "").replaceAll("_", " ")} event
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-muted">
                      <AppDate value={e.date} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
