"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CalendarDays, CircleCheck, CircleAlert, DoorClosed, DoorOpen, Inbox, Save } from "lucide-react";
import PublicShareButton from "@/components/public/PublicShareButton";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate } from "@/lib/nepaliDate";

const EMPTY = { isOpen: false, academicYear: "", grades: [], deadline: "", note: "" };
const NOTE_MAX = 1500;

const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

/**
 * Settings → Admission. One switch opens or closes the admission season:
 * open = the admission form shows on the school's Praavyo profile and its
 * connected website, and applications arrive in Inquiries → Admission;
 * closed = the form stays, marked "closed for this year — apply for next
 * year", and applications arrive marked Next year.
 */
export default function AdmissionSettingsPanel() {
  const { data: session } = useSession();
  const { calendar } = useCalendarPreference();
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(EMPTY);
  const [schoolGrades, setSchoolGrades] = useState([]);
  const [meta, setMeta] = useState({ openedAt: null, closedAt: null });
  const [state, setState] = useState({ loading: true, saving: false, error: "", notice: "" });

  const apply = useCallback((data) => {
    const settings = data.settings || {};
    const next = {
      isOpen: Boolean(settings.isOpen),
      academicYear: settings.academicYear || "",
      grades: settings.grades || [],
      deadline: toInputDate(settings.deadline),
      note: settings.note || "",
    };
    setForm(next);
    setSaved(next);
    setSchoolGrades(data.schoolGrades || []);
    setMeta({ openedAt: settings.openedAt, closedAt: settings.closedAt });
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/school/admission", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Admission settings could not be loaded.");
        if (alive) {
          apply(json.data || {});
          setState((current) => ({ ...current, loading: false }));
        }
      })
      .catch((error) => alive && setState((current) => ({ ...current, loading: false, error: error.message })));
    return () => {
      alive = false;
    };
  }, [apply]);

  async function save(next) {
    setState((current) => ({ ...current, saving: true, error: "", notice: "" }));
    try {
      const res = await fetch("/api/school/admission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, deadline: next.deadline || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Admission settings could not be saved.");
      apply(json.data || {});
      setState((current) => ({ ...current, saving: false, notice: json.message || "Saved." }));
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  }

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const toggleGrade = (grade) =>
    setForm((current) => ({
      ...current,
      grades: current.grades.includes(grade)
        ? current.grades.filter((value) => value !== grade)
        : [...current.grades, grade],
    }));

  const dirty =
    form.academicYear !== saved.academicYear ||
    form.deadline !== saved.deadline ||
    form.note !== saved.note ||
    [...form.grades].sort().join("|") !== [...saved.grades].sort().join("|");

  if (state.loading) {
    return (
      <div className="card space-y-3 p-5">
        <div className="skeleton h-5 w-1/3" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  const open = saved.isOpen;
  const formLink = session?.user?.id ? `/schools/${session.user.id}#admission` : "";
  const since = open ? meta.openedAt : meta.closedAt;

  return (
    <div className="space-y-4">
      {/* The switch */}
      <section
        className={`card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
          open ? "border-success-line bg-success-soft" : ""
        }`}
        aria-labelledby="admission-heading"
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-card text-lg ${
              open ? "bg-success text-white" : "bg-brand-soft text-brand-strong"
            }`}
          >
            {open ? <DoorOpen aria-hidden /> : <DoorClosed aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 id="admission-heading" className="text-lg font-semibold text-ink">
              Admission season is {open ? "open" : "closed"}
            </h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">
              {open
                ? "Families apply for this year from your Praavyo public profile and your connected website. Applications arrive in Inquiries → Admission."
                : "The form stays on your public profile and website, clearly marked “Admissions are closed for this year — apply for next year”. Those applications arrive in Inquiries marked Next year. Turn it on to open admissions for this year."}
            </p>
            {since && (
              <p className="mt-1 text-xs text-muted">
                {open ? "Opened" : "Closed"} {formatDate(since, calendar)}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={open}
          aria-label={open ? "Close the admission season" : "Open the admission season"}
          disabled={state.saving}
          onClick={() => save({ ...form, isOpen: !open })}
          className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
            open ? "border-success bg-success" : "border-line-strong bg-line"
          }`}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full bg-white shadow transition-transform ${
              open ? "translate-x-8" : "translate-x-1"
            }`}
          />
        </button>
      </section>

      {state.error && (
        <p role="alert" className="flex items-center gap-2 rounded-card border border-danger-line bg-danger-soft p-3 text-sm text-danger">
          <CircleAlert aria-hidden /> {state.error}
        </p>
      )}
      {state.notice && !state.error && (
        <p role="status" className="flex items-center gap-2 rounded-card border border-success-line bg-success-soft p-3 text-sm text-success">
          <CircleCheck aria-hidden /> {state.notice}
        </p>
      )}

      {/* What families see */}
      <section className="card space-y-5 p-4 sm:p-5">
        <div>
          <h3 className="font-semibold text-ink">What families see</h3>
          <p className="mt-0.5 text-sm text-muted">Shown above the admission form on your profile and website.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="admission-year" className="label">Academic year</label>
            <input
              id="admission-year"
              value={form.academicYear}
              onChange={set("academicYear")}
              maxLength={40}
              placeholder="e.g. 2083 BS"
              className="input w-full"
            />
          </div>
          <div>
            <label htmlFor="admission-deadline" className="label">
              Last date to apply <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="admission-deadline"
                type="date"
                value={form.deadline}
                onChange={set("deadline")}
                className="input w-full"
              />
              {form.deadline && calendar === "BS" && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted" lang="ne">
                  <CalendarDays aria-hidden /> {formatDate(form.deadline, "BS")}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">Shown to families. The season stays open until you turn it off.</p>
          </div>
        </div>

        <fieldset>
          <legend className="label">Grades taking applications</legend>
          <p className="mb-2 text-xs text-muted">
            {form.grades.length === 0 ? "None ticked = every grade is open." : `${form.grades.length} selected.`}
          </p>
          {schoolGrades.length ? (
            <div className="flex flex-wrap gap-2">
              {schoolGrades.map((grade) => {
                const checked = form.grades.includes(grade);
                return (
                  <label
                    key={grade}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      checked ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line-strong text-body hover:bg-surface-2"
                    }`}
                  >
                    <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleGrade(grade)} />
                    {grade}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">Add your grades in Academic Setup first.</p>
          )}
        </fieldset>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="admission-note" className="label">Instructions for families</label>
            <span className="text-2xs text-subtle tabular-nums">{form.note.length}/{NOTE_MAX}</span>
          </div>
          <textarea
            id="admission-note"
            rows={5}
            value={form.note}
            onChange={set("note")}
            maxLength={NOTE_MAX}
            placeholder="Documents to bring, entrance test date, office hours, fees…"
            className="input w-full"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link href="/school/dashboard?tab=inquiries&type=ADMISSION" className="btn btn-ghost">
              <Inbox aria-hidden /> View applications
            </Link>
            {open && formLink && (
              <PublicShareButton href={formLink} title="admission form" label="Copy form link" className="btn btn-ghost" />
            )}
          </div>
          <button type="button" disabled={!dirty || state.saving} onClick={() => save({ ...form, isOpen: open })} className="btn btn-primary">
            <Save aria-hidden /> {state.saving ? "Saving…" : "Save details"}
          </button>
        </div>
      </section>
    </div>
  );
}
