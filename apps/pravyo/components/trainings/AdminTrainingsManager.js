"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Lock,
  Pencil,
  Plus,
  Presentation,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { buildGradeLabels } from "@/lib/schoolGrades";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDate } from "@/lib/nepaliDate";
import DatePickerField from "@pravyo/cas/components/ui/DatePickerField";
import { isoOfDate } from "@pravyo/cas/components/ui/NepaliCalendar";
import EmptyState from "@/components/EmptyState";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Praavyo trainings, run by the super admin: create → publish → schools
 * register → train at each school → mark that school completed, which issues
 * its participants' certificates (Praavyo + school logos).
 */
const STATUS = {
  DRAFT: { label: "Draft", badge: "badge-neutral" },
  PUBLISHED: { label: "Registration open", badge: "badge-success" },
  CLOSED: { label: "Registration closed", badge: "badge-warning" },
};
const AUDIENCE = {
  STUDENTS: { label: "Students", icon: GraduationCap },
  TEACHERS: { label: "Teachers", icon: Presentation },
};
const EMPTY_FORM = { title: "", description: "", audience: "STUDENTS", grades: [], duration: "", registrationDeadline: "" };

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Something went wrong. Please try again.");
  return json.data || {};
}

export default function AdminTrainingsManager() {
  const { calendar } = useCalendarPreference();
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState(null); // { id?, ...fields } while creating/editing
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/api/admin/trainings");
      setTrainings(data.trainings || []);
    } catch (error) {
      setFeedback({ type: "error", title: "Trainings could not be loaded", message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (form) {
    return (
      <TrainingForm
        initial={form}
        calendar={calendar}
        onCancel={() => setForm(null)}
        onSaved={(training, created) => {
          setForm(null);
          setFeedback({
            type: "success",
            title: created ? "Training created as a draft" : "Training updated",
            message: created ? "Publish it when schools should be able to register." : "",
          });
          load();
          if (created) setOpenId(training.id);
        }}
      />
    );
  }

  if (openId) {
    return (
      <TrainingDetail
        id={openId}
        calendar={calendar}
        onBack={() => { setOpenId(""); load(); }}
        onEdit={(training) => setForm({
          id: training.id,
          title: training.title,
          description: training.description,
          audience: training.audience,
          grades: training.grades,
          duration: training.duration,
          registrationDeadline: training.registrationDeadline ? isoOfDate(new Date(training.registrationDeadline)) : "",
        })}
        onDeleted={() => { setOpenId(""); setFeedback({ type: "success", title: "Training deleted" }); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {feedback && <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />}

      <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">Trainings</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Courses and workshops Praavyo runs at schools — AI, Canva and more. Schools register their students or
            teachers; after training at a school, mark it completed to issue certificates.
          </p>
        </div>
        <button type="button" onClick={() => setForm({ ...EMPTY_FORM })} className="btn btn-primary">
          <Plus aria-hidden /> New training
        </button>
      </div>

      <section className="card overflow-hidden" aria-label="Trainings">
        {loading ? (
          <div className="divide-y divide-line">
            {[1, 2].map((index) => (
              <div key={index} className="space-y-2 p-4">
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : trainings.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Presentation} title="No trainings yet" description="Create the first one — for example “Canva 5-Day Training” for teachers." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {trainings.map((training) => {
              const audience = AUDIENCE[training.audience];
              return (
                <li key={training.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(training.id)}
                    className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control bg-brand-soft text-brand-strong">
                      <audience.icon aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`badge ${STATUS[training.status].badge}`}>{STATUS[training.status].label}</span>
                        <span className="badge badge-brand">For {audience.label.toLowerCase()}</span>
                        {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
                      </span>
                      <span className="mt-1 block truncate font-semibold text-ink">{training.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {training.schoolCount} school{training.schoolCount === 1 ? "" : "s"} registered ·{" "}
                        {training.participantCount} {training.audience === "TEACHERS" ? "teachers" : "students"} ·{" "}
                        {training.completedCount} completed
                      </span>
                    </span>
                    <ChevronRight className="shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function TrainingForm({ initial, calendar, onCancel, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gradeOptions = buildGradeLabels();
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleGrade = (grade) =>
    set("grades", form.grades.includes(grade) ? form.grades.filter((item) => item !== grade) : [...form.grades, grade]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { id, ...body } = form;
      const data = await api(id ? `/api/admin/trainings/${id}` : "/api/admin/trainings", { method: id ? "PATCH" : "POST", body });
      onSaved(data.training, !id);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-ink">{form.id ? "Edit training" : "New training"}</h2>
        <button type="button" className="btn-icon btn-ghost btn-sm" aria-label="Close" onClick={onCancel}><X aria-hidden /></button>
      </div>
      <form onSubmit={save} className="space-y-5 p-4 sm:p-5">
        {error && <AlertBanner type="error" title="Not saved" message={error} />}
        <div>
          <label htmlFor="training-title" className="label">Title</label>
          <input id="training-title" className="input" required minLength={2} maxLength={160} value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="e.g. Canva 5-Day Training" autoFocus />
        </div>
        <div>
          <label htmlFor="training-description" className="label">What the training covers</label>
          <textarea id="training-description" className="input w-full" rows={4} maxLength={3000} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Topics, what participants will learn, what to bring." />
        </div>
        <fieldset>
          <legend className="label">Who is it for?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(AUDIENCE).map(([value, audience]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-card border p-3 ${form.audience === value ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand-line"}`}>
                <input type="radio" name="training-audience" checked={form.audience === value} onChange={() => set("audience", value)} />
                <audience.icon className="text-brand-strong" aria-hidden />
                <span className="font-semibold text-ink">{audience.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Schools register {form.audience === "TEACHERS" ? "their teachers" : "their students — the whole school, some grades or chosen students"}.</p>
        </fieldset>
        {form.audience === "STUDENTS" && (
          <fieldset>
            <legend className="label">Grades <span className="font-normal text-muted">(leave as “All grades” unless it is only for some)</span></legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={!form.grades.length} onClick={() => set("grades", [])} className={`btn btn-sm rounded-full border ${!form.grades.length ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-body"}`}>All grades</button>
              {gradeOptions.map((grade) => (
                <button key={grade} type="button" aria-pressed={form.grades.includes(grade)} onClick={() => toggleGrade(grade)} className={`btn btn-sm rounded-full border ${form.grades.includes(grade) ? "border-brand bg-brand-soft text-brand-strong" : "border-line-strong bg-surface text-body"}`}>{grade}</button>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="training-duration" className="label">Duration <span className="font-normal text-muted">(printed on the certificate)</span></label>
            <input id="training-duration" className="input" maxLength={60} value={form.duration} onChange={(event) => set("duration", event.target.value)} placeholder="e.g. 5 days" />
          </div>
          <div>
            <label htmlFor="training-deadline" className="label">Registration deadline <span className="font-normal text-muted">(optional)</span></label>
            <DatePickerField id="training-deadline" value={form.registrationDeadline} onChange={(value) => set("registrationDeadline", value)} calendar={calendar} placeholder="Open until you close it" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving…" : form.id ? "Save changes" : "Create training"}</button>
          <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        </div>
      </form>
    </section>
  );
}

function TrainingDetail({ id, calendar, onBack, onEdit, onDeleted }) {
  const [state, setState] = useState({ loading: true, training: null, registrations: [] });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [expanded, setExpanded] = useState("");
  const [completeDates, setCompleteDates] = useState({});

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/admin/trainings/${id}`);
      setState({ loading: false, training: data.training, registrations: data.registrations || [] });
    } catch (error) {
      setState((current) => ({ ...current, loading: false }));
      setFeedback({ type: "error", title: "Training could not be loaded", message: error.message });
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function run(key, task, success) {
    setBusy(key);
    setFeedback(null);
    try {
      await task();
      if (success) setFeedback({ type: "success", title: success });
      await load();
    } catch (error) {
      setFeedback({ type: "error", title: "That did not work", message: error.message });
    } finally {
      setBusy("");
      setConfirm(null);
    }
  }

  const { training, registrations } = state;
  if (state.loading) return <div className="card p-5"><div className="skeleton h-5 w-1/3" /><div className="skeleton mt-3 h-3 w-2/3" /></div>;
  if (!training) return <button type="button" onClick={onBack} className="btn btn-ghost"><ArrowLeft aria-hidden /> Trainings</button>;

  const audience = AUDIENCE[training.audience];
  const people = training.audience === "TEACHERS" ? "teachers" : "students";
  const setStatus = (action, message) => run(action, () => api(`/api/admin/trainings/${id}`, { method: "PATCH", body: { action } }), message);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-ghost -ml-2"><ArrowLeft aria-hidden /> All trainings</button>
      {feedback && <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />}

      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`badge ${STATUS[training.status].badge}`}>{STATUS[training.status].label}</span>
              <span className="badge badge-brand"><audience.icon /> For {audience.label.toLowerCase()}</span>
              {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
              {training.grades.length > 0 && <span className="badge badge-neutral">{training.grades.join(", ")}</span>}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-ink">{training.title}</h2>
            {training.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-body">{training.description}</p>}
            {training.registrationDeadline && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted">
                <CalendarDays aria-hidden /> Register by <span lang={calendar === "BS" ? "ne" : undefined}>{formatDate(training.registrationDeadline, calendar)}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {training.status === "DRAFT" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("publish", "Published — schools can register now")} className="btn btn-primary"><Send aria-hidden /> Publish</button>}
            {training.status === "PUBLISHED" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("close", "Registration closed")} className="btn btn-secondary"><Lock aria-hidden /> Close registration</button>}
            {training.status === "CLOSED" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("reopen", "Registration reopened")} className="btn btn-secondary"><Unlock aria-hidden /> Reopen registration</button>}
            <button type="button" onClick={() => onEdit(training)} className="btn btn-ghost"><Pencil aria-hidden /> Edit</button>
            <button type="button" onClick={() => setConfirm({ kind: "delete" })} className="btn-icon btn-ghost text-muted hover:!text-danger" aria-label="Delete training" title="Delete training"><Trash2 aria-hidden /></button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden" aria-label="School registrations">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="font-semibold text-ink">Schools <span className="ml-1 font-normal text-muted tabular-nums">{registrations.length}</span></h3>
          <span className="text-xs text-muted">Mark a school completed after training there</span>
        </div>
        {registrations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BadgeCheck}
              title={training.status === "DRAFT" ? "Publish to let schools register" : "No school has registered yet"}
              description={training.status === "DRAFT" ? "Schools see this training in Platform Events → Trainings once it is published." : "Registrations appear here as schools sign up."}
            />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {registrations.map((registration) => {
              const completed = registration.status === "COMPLETED";
              const open = expanded === registration.id;
              const date = completeDates[registration.id] ?? isoOfDate(new Date());
              return (
                <li key={registration.id} className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <button type="button" onClick={() => setExpanded(open ? "" : registration.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {open ? <ChevronDown className="shrink-0 text-muted" aria-hidden /> : <ChevronRight className="shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{registration.schoolName || "School"}</span>
                        <span className="block text-xs text-muted">
                          {registration.participantCount} {people}
                          {registration.selection.mode === "ALL" ? " · whole school" : registration.selection.mode === "GRADES" ? ` · ${registration.selection.grades.join(", ")}` : ""}
                          {completed && registration.trainingDate && <> · trained on <span lang={calendar === "BS" ? "ne" : undefined}>{formatDate(registration.trainingDate, calendar)}</span></>}
                        </span>
                      </span>
                    </button>

                    {completed ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-success"><BadgeCheck /> {registration.certificates.length} certificates issued</span>
                        <a href={`/certificates/bulk?ids=${registration.certificates.map((row) => row.id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Printer aria-hidden /> Print all</a>
                        <button type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "reopen", registration })} className="btn btn-ghost btn-sm"><RotateCcw aria-hidden /> Undo</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-60">
                          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">Trained on</span>
                          <DatePickerField value={date} onChange={(value) => setCompleteDates((current) => ({ ...current, [registration.id]: value }))} calendar={calendar} clearable={false} max={isoOfDate(new Date())} align="right" />
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(busy) || training.status === "DRAFT"}
                          onClick={() => setConfirm({ kind: "complete", registration, date })}
                          className="btn btn-primary"
                        >
                          <BadgeCheck aria-hidden /> Mark completed
                        </button>
                      </div>
                    )}
                  </div>

                  {open && (
                    <ul className="mt-3 grid gap-1.5 rounded-card border border-line bg-surface-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {registration.participants.map((person) => {
                        const certificate = registration.certificates.find((row) => row.personId === person.id);
                        return (
                          <li key={person.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-ink">{person.name}{person.grade && <span className="text-muted"> · {person.grade}</span>}</span>
                            {certificate && <a href={certificate.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-brand hover:underline">Certificate</a>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.kind === "complete" ? `Mark ${confirm.registration.schoolName} completed?`
            : confirm?.kind === "reopen" ? "Undo this completion?"
              : "Delete this training?"
        }
        message={
          confirm?.kind === "complete"
            ? `${confirm.registration.participantCount} ${people} get their Praavyo certificate now, dated ${formatDate(new Date(`${confirm.date}T12:00:00`), calendar)}.`
            : confirm?.kind === "reopen"
              ? "The certificates already issued to this school's participants are withdrawn, and the school can edit its list again."
              : "Every school's registration is removed too. This cannot be undone."
        }
        confirmLabel={confirm?.kind === "complete" ? "Issue certificates" : confirm?.kind === "reopen" ? "Withdraw certificates" : "Delete training"}
        tone={confirm?.kind === "complete" ? "info" : "danger"}
        busy={Boolean(busy)}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm.kind === "delete") {
            setBusy("delete");
            api(`/api/admin/trainings/${id}`, { method: "DELETE" })
              .then(onDeleted)
              .catch((error) => { setFeedback({ type: "error", title: "Not deleted", message: error.message }); setBusy(""); setConfirm(null); });
            return;
          }
          const body = confirm.kind === "complete" ? { action: "complete", trainingDate: confirm.date } : { action: "reopen" };
          run(confirm.registration.id, () => api(`/api/admin/trainings/${id}/registrations/${confirm.registration.id}`, { method: "POST", body }),
            confirm.kind === "complete" ? "Certificates issued" : "Completion undone");
        }}
      />
    </div>
  );
}
