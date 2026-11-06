"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Globe,
  GraduationCap,
  Lock,
  Pencil,
  Plus,
  Presentation,
  Printer,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Undo2,
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
import ParticipantTable from "@/components/trainings/ParticipantTable";

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

const toldSchools = (count) =>
  count > 0
    ? `${count} school${count === 1 ? " was" : "s were"} notified — it is in their bell and Received Notices, ready to register.`
    : "Schools see it in Platform Events → Trainings.";

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Something went wrong. Please try again.");
  // The server's own sentence ("Already reminded today") rides along.
  return { ...(json.data || {}), message: json.message || "" };
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
        onSaved={(training, created, schoolsNotified) => {
          setForm(null);
          const published = created && training.status === "PUBLISHED";
          setFeedback({
            type: "success",
            title: published ? "Training published" : created ? "Training saved as a draft" : "Training updated",
            message: published
              ? toldSchools(schoolsNotified)
              : created
              ? "Schools cannot see a draft. Open it and press Publish when they should register."
              : "",
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
                        {training.awaitingCount > 0 && (
                          <span className="badge badge-warning"><ClipboardCheck /> {training.awaitingCount} waiting for certificates</span>
                        )}
                        <span className="badge badge-brand">For {audience.label.toLowerCase()}</span>
                        {training.duration && <span className="badge badge-neutral">{training.duration}</span>}
                      </span>
                      <span className="mt-1 block truncate font-semibold text-ink">{training.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {training.schoolCount} school{training.schoolCount === 1 ? "" : "s"} ·{" "}
                        {training.participantCount} {training.audience === "TEACHERS" ? "teachers" : "students"} registered ·{" "}
                        {training.presentCount} present · {training.completedCount} school{training.completedCount === 1 ? "" : "s"} certified
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

  // A new training is published straight away unless "Save as draft" was
  // pressed; schools only ever see published ones.
  async function save(event) {
    event.preventDefault();
    const publish = !form.id && event.nativeEvent?.submitter?.value !== "draft";
    setSaving(true);
    setError("");
    try {
      const { id, ...body } = form;
      const data = await api(id ? `/api/admin/trainings/${id}` : "/api/admin/trainings", {
        method: id ? "PATCH" : "POST",
        body: id ? body : { ...body, publish },
      });
      onSaved(data.training, !id, data.schoolsNotified || 0);
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
          <button type="submit" value="publish" disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : form.id ? "Save changes" : <><Send aria-hidden /> Publish to schools</>}
          </button>
          {!form.id && <button type="submit" value="draft" disabled={saving} className="btn btn-secondary">Save as draft</button>}
          <button type="button" onClick={onCancel} className="btn btn-ghost">Cancel</button>
        </div>
      </form>
    </section>
  );
}

// Where each school is: still with the school, attendance received, certified.
const STAGES = {
  REGISTERED: { label: "Waiting for attendance", badge: "badge-neutral" },
  SUBMITTED: { label: "Attendance received", badge: "badge-warning" },
  COMPLETED: { label: "Certificates issued", badge: "badge-success" },
};
const FILTERS = [
  ["ALL", "All"],
  ["REGISTERED", "Waiting for attendance"],
  ["SUBMITTED", "Attendance received"],
  ["COMPLETED", "Certificates issued"],
];

function Figure({ label, value, tone = "text-ink" }) {
  return (
    <div className="card p-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function TrainingDetail({ id, calendar, onBack, onEdit, onDeleted }) {
  const [state, setState] = useState({ loading: true, training: null, registrations: [] });
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null); // { kind, registration?, date? }
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState("");
  const [issueDates, setIssueDates] = useState({});
  const [stage, setStage] = useState("ALL");
  const [search, setSearch] = useState("");

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
      const result = await task();
      const message = typeof success === "function" ? success(result) : success;
      if (message) setFeedback(typeof message === "string" ? { type: "success", title: message } : { type: "success", ...message });
      await load();
    } catch (error) {
      setFeedback({ type: "error", title: "That did not work", message: error.message });
    } finally {
      setBusy("");
      setConfirm(null);
      setReason("");
    }
  }

  const { training, registrations } = state;
  if (state.loading) return <div className="card p-5"><div className="skeleton h-5 w-1/3" /><div className="skeleton mt-3 h-3 w-2/3" /></div>;
  if (!training) return <button type="button" onClick={onBack} className="btn btn-ghost"><ArrowLeft aria-hidden /> Trainings</button>;

  const audience = AUDIENCE[training.audience];
  const people = training.audience === "TEACHERS" ? "teachers" : "students";
  const setStatus = (action, message) => run(action, () => api(`/api/admin/trainings/${id}`, { method: "PATCH", body: { action } }), message);
  const act = (registration, body, message) =>
    run(registration.id, () => api(`/api/admin/trainings/${id}/registrations/${registration.id}`, { method: "POST", body }), message);

  const totals = registrations.reduce(
    (sum, row) => ({
      people: sum.people + row.participantCount,
      present: sum.present + (row.status === "REGISTERED" ? 0 : row.presentCount),
      certificates: sum.certificates + (row.certificates?.length || 0),
    }),
    { people: 0, present: 0, certificates: 0 }
  );
  const counts = Object.fromEntries(FILTERS.map(([value]) => [value, value === "ALL" ? registrations.length : registrations.filter((row) => row.status === value).length]));
  const query = search.trim().toLowerCase();
  const shown = registrations.filter(
    (row) => (stage === "ALL" || row.status === stage) && (!query || (row.schoolName || "").toLowerCase().includes(query))
  );
  const dayOf = (row) => issueDates[row.id] ?? (row.trainingDate ? isoOfDate(new Date(row.trainingDate)) : isoOfDate(new Date()));

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
            {training.status === "DRAFT" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("publish", (data) => ({ title: "Published — schools can register now", message: toldSchools(data?.schoolsNotified || 0) }))} className="btn btn-primary"><Send aria-hidden /> Publish</button>}
            {training.status === "PUBLISHED" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("close", (data) => ({ title: "Registration closed", message: data?.schoolsNotified ? `${data.schoolsNotified} registered school${data.schoolsNotified === 1 ? " was" : "s were"} asked to send attendance after the training.` : "" }))} className="btn btn-secondary"><Lock aria-hidden /> Close registration</button>}
            {training.status === "CLOSED" && <button type="button" disabled={Boolean(busy)} onClick={() => setStatus("reopen", "Registration reopened")} className="btn btn-secondary"><Unlock aria-hidden /> Reopen registration</button>}
            {training.status !== "DRAFT" && <a href={`/trainings/${training.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><Globe aria-hidden /> Public page</a>}
            <button type="button" onClick={() => onEdit(training)} className="btn btn-ghost"><Pencil aria-hidden /> Edit</button>
            <button type="button" onClick={() => setConfirm({ kind: "delete" })} className="btn-icon btn-ghost text-muted hover:!text-danger" aria-label="Delete training" title="Delete training"><Trash2 aria-hidden /></button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Schools" value={registrations.length} />
        <Figure label={`${people} registered`} value={totals.people} />
        <Figure label="Present" value={totals.present} tone="text-success" />
        <Figure label="Certificates issued" value={totals.certificates} tone="text-brand-strong" />
      </div>

      <section className="card overflow-hidden" aria-label="School registrations">
        <div className="space-y-3 border-b border-line p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="tabs overflow-x-auto" role="tablist" aria-label="Show schools">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={stage === value} onClick={() => setStage(value)} className="tab whitespace-nowrap">
                  {label} <span className="tabular-nums text-muted">{counts[value]}</span>
                </button>
              ))}
            </div>
            <div className="relative lg:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search school" className="input w-full pl-9" aria-label="Search school" />
            </div>
          </div>
          <p className="text-xs text-muted">Each school marks Present/Absent after the training and sends it here. Issue its certificates once it arrives — only those present get one.</p>
        </div>

        {registrations.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={BadgeCheck}
              title={training.status === "DRAFT" ? "Publish to let schools register" : "No school has registered yet"}
              description={training.status === "DRAFT" ? "Schools see this training in Platform Events → Trainings once it is published." : "Registrations appear here as schools sign up."}
            />
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No school matches.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((registration) => {
              const open = expanded === registration.id;
              const stageInfo = STAGES[registration.status] || STAGES.REGISTERED;
              const received = registration.status === "SUBMITTED";
              const certified = registration.status === "COMPLETED";
              const marked = registration.status !== "REGISTERED";
              return (
                <li key={registration.id} className="p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <button type="button" onClick={() => setExpanded(open ? "" : registration.id)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      {open ? <ChevronDown className="shrink-0 text-muted" aria-hidden /> : <ChevronRight className="shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-ink">{registration.schoolName || "School"}</span>
                          <span className={`badge ${stageInfo.badge}`}>{stageInfo.label}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {registration.participantCount} {people}
                          {registration.wholeGrades.length > 0 && ` · ${registration.wholeGrades.join(", ")} whole`}
                          {marked && <> · <span className="text-success">{registration.presentCount} present</span> · <span className="text-danger">{registration.absentCount} absent</span></>}
                          {marked && registration.trainingDate && <> · trained <span lang={calendar === "BS" ? "ne" : undefined}>{formatDate(registration.trainingDate, calendar)}</span></>}
                          {registration.status === "REGISTERED" && registration.returnReason && <> · <span className="text-warning">sent back: {registration.returnReason}</span></>}
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-wrap items-end gap-2">
                      {certified ? (
                        <>
                          <a href={`/certificates/bulk?ids=${registration.certificates.map((row) => row.id).join(",")}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm"><Printer aria-hidden /> Print all</a>
                          <button type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "reopen", registration })} className="btn btn-ghost btn-sm"><RotateCcw aria-hidden /> Undo</button>
                        </>
                      ) : received ? (
                        <>
                          <div className="w-56">
                            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-muted">Trained on</span>
                            <DatePickerField value={dayOf(registration)} onChange={(value) => setIssueDates((current) => ({ ...current, [registration.id]: value }))} calendar={calendar} clearable={false} max={isoOfDate(new Date())} align="right" />
                          </div>
                          <button type="button" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: "return", registration })} className="btn btn-ghost"><Undo2 aria-hidden /> Send back</button>
                          <button type="button" disabled={Boolean(busy) || registration.presentCount === 0} onClick={() => setConfirm({ kind: "complete", registration, date: dayOf(registration) })} className="btn btn-primary">
                            <BadgeCheck aria-hidden /> Issue {registration.presentCount} certificate{registration.presentCount === 1 ? "" : "s"}
                          </button>
                        </>
                      ) : (
                        <button type="button" disabled={busy === registration.id} onClick={() => act(registration, { action: "remind" }, (data) => data.message)} className="btn btn-secondary btn-sm">
                          <BellRing aria-hidden /> Remind school
                        </button>
                      )}
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3">
                      <ParticipantTable participants={registration.participants} certificates={registration.certificates} teachers={people === "teachers"} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirm?.kind === "return" && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setConfirm(null)}>
          <div className="modal-panel w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby="return-title">
            <h3 id="return-title" className="font-semibold text-ink">Send the attendance back to {confirm.registration.schoolName}?</h3>
            <p className="mt-1 text-sm text-muted">The school corrects it and sends it again. Tell them what to fix.</p>
            <label htmlFor="return-reason" className="label mt-4">What should they correct?</label>
            <textarea id="return-reason" className="input w-full" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Asha attended — please mark her present." autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={Boolean(busy) || reason.trim().length < 3} onClick={() => act(confirm.registration, { action: "return", reason }, "Attendance sent back to the school")}>
                <Undo2 aria-hidden /> Send back
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm) && confirm.kind !== "return"}
        title={
          confirm?.kind === "complete" ? `Issue ${confirm.registration.schoolName}'s certificates?`
            : confirm?.kind === "reopen" ? "Undo these certificates?"
              : "Delete this training?"
        }
        message={
          confirm?.kind === "complete"
            ? `${confirm.registration.presentCount} present ${people} get their Praavyo certificate, dated ${formatDate(new Date(`${confirm.date}T12:00:00`), calendar)}.${confirm.registration.absentCount ? ` ${confirm.registration.absentCount} absent get none.` : ""}`
            : confirm?.kind === "reopen"
              ? "The certificates are withdrawn. The school's attendance stays here, ready to issue again."
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
          if (confirm.kind === "complete") act(confirm.registration, { action: "complete", trainingDate: confirm.date }, (data) => data.message || "Certificates issued");
          else act(confirm.registration, { action: "reopen" }, "Certificates withdrawn");
        }}
      />
    </div>
  );
}
