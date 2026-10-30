"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck as FaCertificate, ArrowLeftRight as FaExchangeAlt, Feather as FaFeatherAlt, GraduationCap as FaGraduationCap, School as FaSchool, Trophy as FaTrophy } from "lucide-react";
import LoadingState from "@/components/ui/LoadingState";
import AlertBanner from "@/components/ui/AlertBanner";
import EmptyState from "@/components/EmptyState";
import CalendarToggle from "@/components/common/CalendarToggle";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatMonthYear } from "@/lib/nepaliDate";

const ENROLLMENT_STATUS = {
  CURRENT: { label: "Current", classes: "bg-success-soft text-success" },
  PROMOTED: { label: "Promoted", classes: "bg-brand-soft text-brand" },
  RETAINED: { label: "Repeated", classes: "bg-warning-soft text-warning" },
  TRANSFERRED: { label: "Transferred", classes: "bg-brand-soft text-brand-strong" },
  GRADUATED: { label: "Graduated", classes: "bg-surface-2 text-muted" },
};

// A human "when did they study here" range for a journey entry, in the viewer's
// chosen calendar (AD or BS).
function formatEnrollmentRange(entry, calendar) {
  const start = formatMonthYear(entry.startedAt, calendar);
  if (entry.status === "CURRENT") {
    return start ? `Since ${start} · Present` : "Present";
  }
  const end = formatMonthYear(entry.endedAt, calendar);
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "";
}

function formatPlacement(value) {
  return String(value || "Participant").replaceAll("_", " ");
}

export default function StudentHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeYear, setActiveYear] = useState("ALL");
  const { calendar } = useCalendarPreference();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/student/history", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "Failed to load history");
        if (active) setData(json.data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const matchesYear = (yearStart) =>
    activeYear === "ALL" || String(yearStart) === String(activeYear);

  const filtered = useMemo(() => {
    if (!data) return { journey: [], achievements: [], writings: [] };
    return {
      journey: data.journey.filter((j) => matchesYear(j.academicYearStart)),
      achievements: data.achievements.filter((a) => matchesYear(a.academicYearStart)),
      writings: data.writings.filter((w) => matchesYear(w.academicYearStart)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, activeYear]);

  if (loading) {
    return (
      <LoadingState
        title="Loading your journey"
        message="Gathering your schools, achievements, and writing."
        className="min-h-[50vh]"
      />
    );
  }

  if (error) {
    return <AlertBanner type="error" title="Could not load history" message={error} />;
  }

  const schoolsCount = data?.student?.schoolsCount || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-ink">My Journey</h1>
        <CalendarToggle />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile icon={FaSchool} label="Schools" value={schoolsCount} />
        <SummaryTile icon={FaGraduationCap} label="Sessions" value={data?.years?.length || 0} />
        <SummaryTile icon={FaTrophy} label="Achievements" value={data?.achievements?.length || 0} />
        <SummaryTile icon={FaFeatherAlt} label="Writing" value={data?.writings?.length || 0} />
      </div>

      {/* Year filter */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={activeYear === "ALL"}
          onClick={() => setActiveYear("ALL")}
          label="All years"
        />
        {(data?.years || []).map((y) => (
          <FilterChip
            key={y.yearStart}
            active={String(activeYear) === String(y.yearStart)}
            onClick={() => setActiveYear(y.yearStart)}
            label={y.year}
          />
        ))}
      </div>

      {/* Journey timeline */}
      <section className="card p-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <FaExchangeAlt className="text-brand" />
          School Journey
        </h2>
        {filtered.journey.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No enrollment records for this year.</p>
        ) : (
          <ol className="relative mt-5 space-y-4 border-l border-line pl-6">
            {filtered.journey.map((entry, index) => {
              const meta = ENROLLMENT_STATUS[entry.status] || ENROLLMENT_STATUS.CURRENT;
              const range = formatEnrollmentRange(entry, calendar);
              const isCurrent = entry.status === "CURRENT";
              return (
                <li
                  key={`${entry.school}-${entry.academicYearStart}-${index}`}
                  className="relative"
                >
                  <span
                    className={`absolute top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-line shadow-card ${
                      isCurrent ? "bg-success" : "bg-brand"
                    }`}
                    style={{ left: "-31px" }}
                  />
                  <div className="card p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-surface text-brand shadow-card">
                        <FaSchool className="text-xs" />
                      </span>
                      <p className="text-sm font-semibold text-ink">
                        {entry.schoolName}
                      </p>
                      <span className={`badge badge-neutral uppercase ${meta.classes}`}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {entry.grade}
                      {entry.academicYear ? ` · ${entry.academicYear}` : ""}
                      {entry.rollNumber ? ` · Roll ${entry.rollNumber}` : ""}
                    </p>
                    {range && (
                      <p className="mt-1 text-xs font-semibold text-brand">
                        {range}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Achievements */}
      <section className="card p-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <FaTrophy className="text-warning" />
          Achievements
        </h2>
        {filtered.achievements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No achievements for this year.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {filtered.achievements.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-warning uppercase">
                    {formatPlacement(a.placement)}
                  </span>
                  {a.academicYear && (
                    <span className="badge badge-neutral">
                      {a.academicYear}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{a.title}</p>
                <p className="mt-1 text-xs text-muted">
                  {a.eventTitle ? `${a.eventTitle} · ` : ""}
                  {a.schoolName}
                  {a.awardedAt ? ` · ${formatMonthYear(a.awardedAt, calendar)}` : ""}
                </p>
                {a.certificateUrl && (
                  <a
                    href={a.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong"
                  >
                    <FaCertificate /> Certificate
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Writing */}
      <section className="card p-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <FaFeatherAlt className="text-brand-strong" />
          Published Writing
        </h2>
        {filtered.writings.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No writing for this year.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.writings.map((w) => (
              <a
                key={w.id}
                href={`/writings/${w.id}`}
                className="card transition-colors hover:border-brand-line hover:bg-surface-2 block p-4 transition-colors hover:border-brand-line"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-brand uppercase">
                    {String(w.category || "Writing").replaceAll("_", " ")}
                  </span>
                  {w.academicYear && (
                    <span className="badge badge-neutral">
                      {w.academicYear}
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink">
                  {w.title}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {w.schoolName}
                  {w.date ? ` · ${formatMonthYear(w.date, calendar)}` : ""}
                </p>
              </a>
            ))}
          </div>
        )}
      </section>

      {schoolsCount === 0 &&
        (data?.achievements?.length || 0) === 0 &&
        (data?.writings?.length || 0) === 0 && (
          <EmptyState
            icon={FaGraduationCap}
            title="Your journey starts here"
            description="As you join events, win achievements, and publish writing, your full history across every school will appear here."
          />
        )}
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value }) {
  return (
    <div className="card p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-brand">
        <Icon />
      </span>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs font-semibold text-muted">{label}</p>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-ghost btn-sm transition-colors ${
        active
          ? "bg-brand text-white"
          : "border border-line bg-surface text-muted hover:bg-surface"
      }`}
    >
      {label}
    </button>
  );
}
