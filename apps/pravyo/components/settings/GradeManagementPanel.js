"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, CircleCheck, GraduationCap, LoaderCircle, Plus, X } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { sortGrades } from "@/lib/schoolGrades";

/**
 * Settings → Academic Setup → Grades. The grades chosen at signup are only
 * a start: the school adds or removes grades here (Nursery, LKG, UKG,
 * Grade 1–12), and every grade list in Praavyo follows.
 *
 * Each change saves at once — there is no separate save button, so a grade
 * can never look added without being saved. Removing asks first.
 *
 * Removing a grade only stops offering it. Students, sections, subjects,
 * exams and results are never touched, and a grade that still has students
 * on the roll cannot be removed until they are moved.
 */
export default function GradeManagementPanel({ onSaved }) {
  const [grades, setGrades] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [counts, setCounts] = useState({});
  const [state, setState] = useState({ loading: true, busy: "", error: "", notice: "" });
  const [removeTarget, setRemoveTarget] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/school/grade-structure?counts=1", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Grades could not be loaded.");
      setGrades((json.grades || []).map((grade) => grade.name || grade));
      setCatalog(json.catalog || []);
      setCounts(json.studentCounts || {});
      setState((current) => ({ ...current, loading: false }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const casOf = useMemo(() => new Map(catalog.map((item) => [item.name, item.cas])), [catalog]);
  const addable = catalog.filter((item) => !grades.includes(item.name));

  /** Save `next` as the school's grades now. */
  async function save(next, { busy, done }) {
    setState((current) => ({ ...current, busy, error: "", notice: "" }));
    try {
      const res = await fetch("/api/school/grade-structure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Grades could not be saved.");
      const saved = json.data?.grades || next;
      setGrades(saved);
      onSaved?.(saved);
      // Show what the server now holds (and fresh student counts), never
      // just what was sent.
      await load();
      setState((current) => ({ ...current, busy: "", notice: done }));
      return true;
    } catch (error) {
      setState((current) => ({ ...current, busy: "", error: error.message }));
      return false;
    }
  }

  const add = (grade) =>
    save(sortGrades([...grades, grade]), {
      busy: grade,
      done: `${grade} added. It now shows in every grade list.`,
    });

  async function confirmRemove() {
    const grade = removeTarget;
    // Success or refusal (e.g. students still in the grade), the dialog
    // closes and the message above says what happened.
    await save(
      grades.filter((item) => item !== grade),
      { busy: grade, done: `${grade} removed. Its past records stay saved and come back if you add it again.` }
    );
    setRemoveTarget("");
  }

  if (state.loading) {
    return (
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-2/3" />
      </div>
    );
  }

  const working = Boolean(state.busy);

  return (
    <section className="card space-y-5 p-4 sm:p-5" aria-labelledby="grades-heading">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-card bg-brand-soft text-lg text-brand-strong">
          <GraduationCap aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="grades-heading" className="text-lg font-semibold text-ink">Grades</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            The grades your school offers. Add or remove a grade and it is saved at once; every grade list in
            Praavyo (students, sections, subjects, teachers, exams, notices, admission) follows. Removing a grade never
            deletes students or records.
          </p>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          <CircleAlert className="mt-0.5 shrink-0" aria-hidden /> {state.error}
        </p>
      )}
      {state.notice && !state.error && (
        <p role="status" className="flex items-center gap-2 rounded-card border border-success-line bg-success-soft p-3 text-sm text-success">
          <CircleCheck aria-hidden /> {state.notice}
        </p>
      )}

      <div>
        <h3 className="label">Offered now <span className="font-normal text-muted">({grades.length})</span></h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {grades.map((grade) => {
            const students = counts[grade] || 0;
            const busy = state.busy === grade;
            const locked = students > 0 || grades.length === 1;
            return (
              <li key={grade} className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                    {grade}
                    {casOf.get(grade) && <span className="badge badge-brand">CAS</span>}
                  </p>
                  <p className="text-xs text-muted">{students} student{students === 1 ? "" : "s"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRemoveTarget(grade)}
                  disabled={locked || working}
                  title={
                    students > 0
                      ? `Move the ${students} student${students === 1 ? "" : "s"} in ${grade} first`
                      : grades.length === 1
                        ? "Keep at least one grade"
                        : `Remove ${grade}`
                  }
                  aria-label={`Remove ${grade}`}
                  className="btn-icon btn-ghost btn-sm text-muted hover:!bg-danger-soft hover:!text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <X aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          A grade with students can be removed once they are promoted, moved to another grade or transferred.
          <span className="ml-1 font-semibold text-ink">CAS</span> = Nursery to Grade 5, assessed with CAS like Grades 1–5.
        </p>
      </div>

      <div>
        <h3 className="label">Add a grade <span className="font-normal text-muted">(saved when you click)</span></h3>
        {addable.length ? (
          <div className="flex flex-wrap gap-1.5">
            {addable.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => add(item.name)}
                disabled={working}
                className="btn btn-sm rounded-full border border-line-strong bg-surface text-body hover:border-brand-line hover:bg-surface-2"
              >
                {state.busy === item.name ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />} {item.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Every grade Praavyo supports is already offered.</p>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget}?`}
        message={`${removeTarget} leaves every grade list in Praavyo. Past students, exams, results and sections stay saved and come back if you add it again.`}
        confirmLabel={`Remove ${removeTarget}`}
        tone="danger"
        busy={working}
        onClose={() => setRemoveTarget("")}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
