"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleArrowUp as FiArrowUpCircle, Calendar as FiCalendar, CircleCheck as FiCheckCircle, Clock as FiClock, Save as FiSave, Undo2 } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import AppDate from "@/components/common/AppDate";
import { academicYearDisplayLabel } from "@pravyo/core/nepaliDate";

const SUMMARY_FIELDS = [
  ["admitted", "Admitted"],
  ["promoted", "Promoted"],
  ["retained", "Retained"],
  ["graduated", "Graduated"],
  ["transferredIn", "Transferred in"],
  ["transferredOut", "Transferred out"],
];

function displayYear(year) {
  return academicYearDisplayLabel(year?.year, {
    yearStart: year?.yearStart,
    calendar: year?.calendar,
  });
}

export default function AcademicYearManager() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [calendar, setCalendar] = useState("AD");
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Promotion flow
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retained, setRetained] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState(null);
  // Typed confirmation: the new year, exactly as shown.
  const [confirmText, setConfirmText] = useState("");
  // Undo the last promotion (lib/promotionUndo.js).
  const [undoInfo, setUndoInfo] = useState(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [res, undoRes] = await Promise.all([
        fetch("/api/school/academic-year", { cache: "no-store" }),
        fetch("/api/school/academic-year/undo-promotion", { cache: "no-store" }),
      ]);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load academic year");
      setData(json.data);
      setCalendar(json.data?.calendar || "AD");
      const undoJson = await undoRes.json().catch(() => ({}));
      setUndoInfo(undoRes.ok ? undoJson.data : null);
    } catch (error) {
      setFeedback({ type: "error", title: "Could not load", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveCalendar = async () => {
    try {
      setSavingCalendar(true);
      setFeedback(null);
      const res = await fetch("/api/school/academic-year", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save");
      setFeedback({
        type: "success",
        title: "Saved",
        message: "Academic calendar updated.",
      });
      await load();
    } catch (error) {
      setFeedback({ type: "error", title: "Save failed", message: error.message });
    } finally {
      setSavingCalendar(false);
    }
  };

  const openPromote = async () => {
    setPromoteResult(null);
    setRetained(new Set());
    setPromoteOpen(true);
    try {
      setPreviewLoading(true);
      const res = await fetch("/api/school/academic-year/promote", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to build preview");
      setPreview(json.data);
    } catch (error) {
      setFeedback({ type: "error", title: "Preview failed", message: error.message });
      setPromoteOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleStudent = (id) => {
    setRetained((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGradeRetain = (students, retainAll) => {
    setRetained((prev) => {
      const next = new Set(prev);
      students.forEach((s) => {
        if (retainAll) next.add(s.id);
        else next.delete(s.id);
      });
      return next;
    });
  };

  const runPromotion = async () => {
    try {
      setPromoting(true);
      setConfirmOpen(false);
      const res = await fetch("/api/school/academic-year/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmYear: confirmText,
          retainStudentIds: Array.from(retained),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Promotion failed");
      setPromoteResult(json.data);
      setFeedback({ type: "success", title: "Promotion complete", message: json.message });
      await load();
    } catch (error) {
      setFeedback({ type: "error", title: "Promotion failed", message: error.message });
    } finally {
      setPromoting(false);
    }
  };

  const nextYearLabel = displayYear(preview?.nextYear) || String(preview?.nextYear?.yearStart || "");
  const confirmMatches =
    Boolean(confirmText.trim()) &&
    [nextYearLabel, preview?.nextYear?.year, String(preview?.nextYear?.yearStart || "")]
      .filter(Boolean)
      .some((value) => String(value).trim().toLowerCase() === confirmText.trim().toLowerCase());

  const undoPromotion = async () => {
    try {
      setUndoing(true);
      const res = await fetch("/api/school/academic-year/undo-promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "The promotion could not be undone.");
      setFeedback({ type: "success", title: "Promotion undone", message: json.message });
      setUndoOpen(false);
      await load();
    } catch (error) {
      setFeedback({ type: "error", title: "Undo failed", message: error.message });
      setUndoOpen(false);
    } finally {
      setUndoing(false);
    }
  };

  const promoteCounts = useMemo(() => {
    if (!preview) return { promote: 0, retain: 0, graduate: 0 };
    let promote = 0;
    let retain = 0;
    let graduate = 0;
    preview.grades.forEach((group) => {
      group.students.forEach((s) => {
        if (retained.has(s.id)) retain += 1;
        else if (group.graduates) graduate += 1;
        else promote += 1;
      });
    });
    return { promote, retain, graduate };
  }, [preview, retained]);

  if (loading) {
    return (
      <div className="card p-4 sm:p-5">
        <div className="skeleton h-6 w-48 rounded-control" />
        <div className="skeleton mt-4 h-20 w-full rounded-control" />
      </div>
    );
  }

  const current = data?.current;

  return (
    <div className="space-y-4">
      {feedback && (
        <AlertBanner
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
        />
      )}

      {/* Current year + calendar + promote */}
      <div className="card p-4 sm:p-5">
        <h2 className="mb-5 flex items-center gap-2 font-semibold text-ink">
          <FiCalendar className="text-brand" />
          Academic Year
        </h2>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Current session
            </p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {displayYear(current) || "—"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Next will be {displayYear(data?.upcoming) || "—"} after promotion.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-ink">
              Calendar
            </label>
            <select
              value={calendar}
              onChange={(e) => setCalendar(e.target.value)}
              className="input w-full"
            >
              <option value="AD">AD (e.g. 2025)</option>
              <option value="BS">BS (e.g. 2082)</option>
            </select>
            <p className="mt-2 text-xs text-muted">
              Controls how academic years are displayed for your school.
            </p>
          </div>

          <button
            type="button"
            onClick={saveCalendar}
            disabled={savingCalendar || calendar === data?.calendar}
            className="btn btn-primary inline-flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <FiSave />
            {savingCalendar ? "Saving..." : "Save"}
          </button>
        </div>

        {undoInfo?.run?.status === "COMPLETED" && (
          <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 border-warning-line bg-warning-soft p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                Last promotion: {displayYear(undoInfo.run.fromYear) || undoInfo.run.fromYear.year} →{" "}
                {displayYear(undoInfo.run.toYear) || undoInfo.run.toYear.year}
              </p>
              <p className="mt-1 text-xs text-muted">
                <AppDate value={undoInfo.run.createdAt} mode="dateTime" /> · {undoInfo.run.summary?.promoted || 0} promoted,{" "}
                {undoInfo.run.summary?.retained || 0} retained, {undoInfo.run.summary?.graduated || 0} graduated.
                {undoInfo.available
                  ? ` Pressed by mistake? Undo puts every student and the school year back as they were (within ${undoInfo.windowDays} days).`
                  : ` ${undoInfo.blocker}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUndoOpen(true)}
              disabled={!undoInfo.available || undoing}
              className="btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold"
            >
              <Undo2 aria-hidden /> Undo last promotion
            </button>
          </div>
        )}

        <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-ink">Promote to next year</p>
            <p className="mt-1 text-xs text-muted">
              Move every grade up one level for {displayYear(data?.upcoming) || "the next year"}.
              You can keep repeating students in their current grade, and the top
              grade graduates.
            </p>
          </div>
          <button
            type="button"
            onClick={openPromote}
            className="btn btn-primary inline-flex items-center justify-center gap-2 font-semibold transition-colors"
          >
            <FiArrowUpCircle />
            Promote year
          </button>
        </div>
      </div>

      {/* History */}
      <div className="card p-4 sm:p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-ink">
          <FiClock className="text-warning" />
          Academic Year History
        </h2>
        <p className="mb-5 text-sm text-muted">
          What happened each academic year — admissions, promotions, retentions,
          graduations, and transfers.
        </p>

        {(data?.history || []).length === 0 ? (
          <p className="text-sm text-muted">No academic years recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {data.history.map((year) => (
              <div
                key={year._id}
                className="card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-ink">
                      {displayYear(year)}
                    </span>
                    <span
                      className={`badge badge-neutral inline-flex items-center gap-1 font-semibold ${
                        year.status === "ACTIVE"
                          ? "bg-success-soft text-success"
                          : "bg-surface-2 text-muted"
                      }`}
                    >
                      {year.status === "ACTIVE" ? <FiCheckCircle /> : null}
                      {year.status === "ACTIVE" ? "Active" : "Closed"}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    <AppDate value={year.startedAt} />
                    {year.closedAt ? (
                      <>
                        {" – "}
                        <AppDate value={year.closedAt} />
                      </>
                    ) : (
                      ""
                    )}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUMMARY_FIELDS.map(([key, label]) => (
                    <span
                      key={key}
                      className="badge badge-neutral inline-flex items-center gap-1.5 text-xs"
                    >
                      <span className="font-semibold text-ink">
                        {year.summary?.[key] || 0}
                      </span>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Promotion review modal */}
      {promoteOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="font-semibold text-ink">
                  Promote to {displayYear(preview?.nextYear) || "next year"}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Unchecked students stay in their current grade (repeating). The
                  top grade graduates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromoteOpen(false)}
                className="btn btn-ghost btn-sm font-semibold"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {previewLoading ? (
                <div className="space-y-3">
                  <div className="skeleton h-16 w-full rounded-control" />
                  <div className="skeleton h-16 w-full rounded-control" />
                </div>
              ) : promoteResult ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="relative flex h-24 w-24 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-success" />
                      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success shadow-card">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-10 w-10"
                          fill="none"
                          stroke="white"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path className="" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    </div>
                    <h3 className="mt-5 font-semibold text-ink">
                      Promoted successfully!
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Students advanced to{" "}
                      {displayYear(promoteResult.nextYear) || "the next session"}.
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
                        {promoteResult.summary.promoted} promoted
                      </span>
                      <span className="rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning">
                        {promoteResult.summary.retained} retained
                      </span>
                      <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-strong">
                        {promoteResult.summary.graduated} graduated
                      </span>
                    </div>
                  </div>
                  {promoteResult.failures?.length > 0 && (
                    <div className="rounded-card border border-warning-line bg-warning-soft p-4">
                      <p className="text-sm font-semibold text-warning">
                        {promoteResult.failures.length} student(s) need attention
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-warning">
                        {promoteResult.failures.map((f) => (
                          <li key={f.id}>
                            {f.name} ({f.grade}, roll {f.rollNumber}) — {f.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : preview && preview.totalStudents === 0 ? (
                <p className="text-sm text-muted">
                  No active students to promote. Running this will simply open{" "}
                  {displayYear(preview?.nextYear)}.
                </p>
              ) : (
                <div className="space-y-4">
                  {preview?.grades
                    ?.filter((g) => g.count > 0)
                    .map((group) => {
                      const allRetained = group.students.every((s) =>
                        retained.has(s.id)
                      );
                      return (
                        <div
                          key={group.grade}
                          className="card p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">
                              {group.grade}{" "}
                              <span className="text-muted">→</span>{" "}
                              {group.graduates ? (
                                <span className="text-warning">Graduates</span>
                              ) : (
                                group.nextGrade
                              )}
                              <span className="ml-2 text-xs font-normal text-muted">
                                {group.count} students
                              </span>
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                toggleGradeRetain(group.students, !allRetained)
                              }
                              className="text-xs font-semibold text-brand hover:text-brand-strong"
                            >
                              {allRetained ? "Promote all" : "Retain all"}
                            </button>
                          </div>
                          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                            {group.students.map((s) => {
                              const isRetained = retained.has(s.id);
                              return (
                                <label
                                  key={s.id}
                                  className="btn btn-ghost btn-sm flex cursor-pointer items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={!isRetained}
                                    onChange={() => toggleStudent(s.id)}
                                    className="rounded-control border-line-strong bg-surface text-success"
                                  />
                                  <span className="truncate">
                                    {s.name}
                                    <span className="ml-1 text-xs text-muted">
                                      roll {s.rollNumber}
                                    </span>
                                  </span>
                                  {isRetained && (
                                    <span className="badge badge-warning ml-auto font-semibold">
                                      Repeats
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {!promoteResult && !previewLoading && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
                <p className="text-xs text-muted">
                  <span className="font-semibold text-success">
                    {promoteCounts.promote}
                  </span>{" "}
                  promote ·{" "}
                  <span className="font-semibold text-warning">
                    {promoteCounts.retain}
                  </span>{" "}
                  retain ·{" "}
                  <span className="font-semibold text-brand-strong">
                    {promoteCounts.graduate}
                  </span>{" "}
                  graduate
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmText("");
                    setConfirmOpen(true);
                  }}
                  disabled={promoting}
                  className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
                >
                  <FiArrowUpCircle />
                  Run promotion
                </button>
              </div>
            )}

            {promoteResult && (
              <div className="flex justify-end border-t border-line px-5 py-4">
                <button
                  type="button"
                  onClick={() => setPromoteOpen(false)}
                  className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Promote to ${nextYearLabel || "next year"}?`}
        message={`This advances the school year, moves ${promoteCounts.promote} students up, keeps ${promoteCounts.retain} repeating and graduates ${promoteCounts.graduate}. If it was a mistake, "Undo last promotion" puts everything back within 30 days, as long as nothing has been recorded in the new year.`}
        confirmLabel="Yes, promote"
        tone="warning"
        busy={promoting}
        confirmDisabled={!confirmMatches}
        onClose={() => setConfirmOpen(false)}
        onConfirm={runPromotion}
      >
        <label className="mt-3 block text-sm text-ink">
          Type <strong className="font-semibold">{nextYearLabel}</strong> to confirm
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
            aria-label={`Type ${nextYearLabel} to confirm`}
            className="input mt-1.5 w-full"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={undoOpen}
        title="Undo the last promotion?"
        message={`Every student goes back to the grade, section, roll number and status they had before the promotion, ${
          undoInfo?.run ? displayYear(undoInfo.run.fromYear) || undoInfo.run.fromYear.year : "the previous year"
        } becomes the current year again, and ${
          undoInfo?.run ? displayYear(undoInfo.run.toYear) || undoInfo.run.toYear.year : "the new year"
        } is removed. Graduated students return to the roll.`}
        confirmLabel="Yes, undo promotion"
        tone="warning"
        busy={undoing}
        onClose={() => setUndoOpen(false)}
        onConfirm={undoPromotion}
      />
    </div>
  );
}
