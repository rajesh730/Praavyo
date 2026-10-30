"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, X as FaTimes } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import AppDate from "@/components/common/AppDate";

const TABS = [
  { id: "responsibilities", label: "Responsibilities" },
  { id: "exams", label: "Exam access" },
  { id: "details", label: "Details" },
  { id: "account", label: "Status & login" },
];

const STATUS_BADGE = {
  ACTIVE: "badge badge-success",
  INACTIVE: "badge badge-warning",
  LEFT: "badge badge-neutral",
};
const STATUS_LABEL = { ACTIVE: "Active", INACTIVE: "Inactive", LEFT: "Left" };

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Request failed");
  return payload;
}

const byGrade = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/** "Grade 3 Science, Grade 3 Math, Grade 4 Class Teacher" */
export function describeAssignments(rows) {
  return [...rows]
    .sort((a, b) => byGrade(a.grade, b.grade) || (a.assignmentType === "CLASS_TEACHER" ? 1 : -1))
    .map((row) => `${row.grade} ${row.assignmentType === "CLASS_TEACHER" ? "Class Teacher" : row.subject || row.subjectTitle || "Subject"}`);
}

/**
 * Everything the school can do for one teacher, in one place: what they teach,
 * which exams they may enter marks for, their details, and their standing at
 * this school (active / inactive / left / rejoin) plus password reset.
 */
export default function TeacherDetailPanel({ teacherId, onClose, onChanged }) {
  const [tab, setTab] = useState("responsibilities");
  const [teacher, setTeacher] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => api(`/api/teachers/${teacherId}`)
    .then((payload) => {
      setError("");
      setTeacher(payload.data.teacher);
    })
    .catch((reason) => setError(reason.message)), [teacherId]);

  useEffect(() => { load(); }, [load]);

  // Stable, so child effects keyed on it do not refetch (and wipe edits) on
  // every render.
  const reportError = useCallback((message) => setNotice({ type: "error", title: "Not saved", message }), []);

  const changed = async (message) => {
    setNotice(message ? { type: "success", title: message } : null);
    await load();
    onChanged?.();
  };

  const left = teacher?.status === "LEFT";
  const tabs = left ? TABS.filter((item) => ["responsibilities", "account"].includes(item.id)) : TABS;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-scrim" role="dialog" aria-modal="true" aria-label="Manage teacher">
      <section className="flex h-full w-full max-w-2xl flex-col bg-canvas shadow-pop">
        <header className="flex items-start justify-between gap-4 border-b border-line p-4">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-ink">{teacher?.name || "Teacher"}</h2>
            {teacher && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className={STATUS_BADGE[teacher.status]}>{STATUS_LABEL[teacher.status]}</span>
                <span>{teacher.username ? `@${teacher.username}` : "No username"} · {teacher.email}</span>
                {teacher.worksElsewhere && <span className="badge badge-brand">Also teaches at another school</span>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="btn-icon btn-ghost" aria-label="Close"><FaTimes /></button>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line px-4" aria-label="Teacher sections">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { setTab(item.id); setNotice(null); }}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${tab === item.id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <AlertBanner type="error" title="Teacher unavailable" message={error} />}
          {notice && <div className="mb-4"><AlertBanner type={notice.type} title={notice.title} message={notice.message} /></div>}
          {!teacher && !error && <p className="py-8 text-sm text-muted">Loading…</p>}
          {teacher && tab === "responsibilities" && (left
            ? <LeftHistory teacher={teacher} />
            : <Responsibilities teacher={teacher} onSaved={changed} onError={reportError} />)}
          {teacher && tab === "exams" && <ExamAccess teacher={teacher} onSaved={changed} onError={reportError} />}
          {teacher && tab === "details" && <Details teacher={teacher} onSaved={changed} onError={reportError} />}
          {teacher && tab === "account" && <Account teacher={teacher} onSaved={changed} onError={reportError} />}
        </div>
      </section>
    </div>
  );
}

function LeftHistory({ teacher }) {
  const ended = describeAssignments(teacher.endedAssignments || []);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink">Left on <strong><AppDate value={teacher.leftAt} fallback="—" /></strong>{teacher.leftNote ? ` — ${teacher.leftNote}` : ""}.</p>
      <p className="text-muted">This teacher cannot sign in to your school. Their past marks and published results are kept. To bring them back, use Rejoin under “Status & login”.</p>
      <div className="rounded-control border border-line p-3">
        <p className="font-medium text-ink">Responsibilities when they left</p>
        {ended.length ? <ul className="mt-2 list-inside list-disc text-muted">{ended.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul> : <p className="mt-1 text-muted">None recorded.</p>}
      </div>
    </div>
  );
}

function Responsibilities({ teacher, onSaved, onError }) {
  const [options, setOptions] = useState(null);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/api/teachers/${teacher._id}/teaching-assignments`)
      .then((payload) => {
        setOptions({ grades: payload.data.grades || [], subjects: payload.data.subjects || [] });
        setDraft(payload.data.assignments || []);
      })
      .catch((reason) => onError(reason.message));
  }, [teacher._id, onError]);

  const subjectTitle = useMemo(() => new Map((options?.subjects || []).map((s) => [s.id, s.title])), [options]);
  const summary = describeAssignments(draft.filter((row) => row.assignmentType === "CLASS_TEACHER" || row.subject)
    .map((row) => ({ ...row, subject: subjectTitle.get(row.subject) })));

  if (!options) return <p className="py-8 text-sm text-muted">Loading responsibilities…</p>;

  const add = (assignmentType) => {
    const grade = options.grades[0] || "";
    const subject = assignmentType === "SUBJECT_TEACHER" ? options.subjects.find((item) => item.grade === grade)?.id || "" : null;
    setDraft((current) => [...current, { grade, assignmentType, subject }]);
  };
  const update = (index, patch) => setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const save = async () => {
    if (draft.some((row) => row.assignmentType === "SUBJECT_TEACHER" && !row.subject)) {
      onError("Choose a subject for every subject-teacher row, or remove it.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/teachers/${teacher._id}/teaching-assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: draft }),
      });
      await onSaved("Responsibilities saved");
    } catch (reason) {
      onError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-control border border-line bg-surface p-3 text-sm">
        <p className="text-xs font-semibold uppercase text-muted">Summary</p>
        <p className="mt-1 text-ink">{teacher.name} → {summary.length ? summary.join(", ") : "nothing assigned yet"}</p>
      </div>

      {options.grades.length === 0 && <AlertBanner type="warning" title="No grades configured" message="Add grades in School Settings before assigning teachers." />}
      {options.grades.length > 0 && options.subjects.length === 0 && (
        <AlertBanner type="warning" title="No subjects yet" message="Add subjects in Assessment → Subjects to assign subject teachers. You can still assign a class teacher." />
      )}

      <div className="space-y-2">
        {draft.length === 0 ? <p className="rounded-control border border-dashed border-line p-4 text-sm text-muted">No responsibilities assigned yet.</p> : draft.map((row, index) => {
          const subjects = options.subjects.filter((subject) => subject.grade === row.grade);
          return (
            <div key={`${row.id || "new"}-${index}`} className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
              <select className="input" aria-label="Grade" value={row.grade} onChange={(event) => update(index, {
                grade: event.target.value,
                subject: row.assignmentType === "SUBJECT_TEACHER" ? options.subjects.find((subject) => subject.grade === event.target.value)?.id || "" : null,
              })}>
                {options.grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
              </select>
              {row.assignmentType === "CLASS_TEACHER"
                ? <p className="self-center text-sm font-medium text-ink">Class Teacher</p>
                : (
                  <select className="input" aria-label="Subject" value={row.subject || ""} onChange={(event) => update(index, { subject: event.target.value })}>
                    <option value="">{subjects.length ? "Choose subject" : "No subjects in this grade"}</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title} ({subject.code})</option>)}
                  </select>
                )}
              <button type="button" onClick={() => setDraft((current) => current.filter((_, i) => i !== index))} className="btn btn-secondary btn-sm">Remove</button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add("SUBJECT_TEACHER")} disabled={!options.grades.length || !options.subjects.length} className="btn btn-secondary btn-sm">+ Subject teacher</button>
        <button type="button" onClick={() => add("CLASS_TEACHER")} disabled={!options.grades.length} className="btn btn-secondary btn-sm">+ Class teacher</button>
      </div>
      <p className="text-xs text-muted">A teacher can teach several subjects and grades and also be class teacher. Exam mark entry is granted separately under “Exam access”.</p>

      <div className="flex justify-end border-t border-line pt-4">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save responsibilities"}</button>
      </div>
    </div>
  );
}

function ExamAccess({ teacher, onSaved, onError }) {
  const [data, setData] = useState(null);
  const [granted, setGranted] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/api/teachers/${teacher._id}/exam-access`)
      .then((payload) => {
        setData(payload.data);
        setGranted(new Set((payload.data.grants || []).map((g) => `${g.exam}|${g.grade}|${g.subject}`)));
      })
      .catch((reason) => onError(reason.message));
  }, [teacher._id, onError]);

  if (!data) return <p className="py-8 text-sm text-muted">Loading exam access…</p>;
  if (!data.year) return <AlertBanner type="warning" title="No open academic year" message="Open an academic year in Assessment before granting exam access." />;
  if (!data.rows.length) return <p className="text-sm text-muted">Assign this teacher a subject under “Responsibilities” first. Exam access is granted per subject.</p>;
  if (!data.exams.length) return <p className="text-sm text-muted">No exams exist for {data.year.label} yet. Create exams in Assessment → Exams.</p>;

  const toggle = (key) => setGranted((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      const grants = [...granted].map((key) => {
        const [exam, grade, subject] = key.split("|");
        return { exam, grade, subject };
      });
      await api(`/api/teachers/${teacher._id}/exam-access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grants }),
      });
      await onSaved("Exam access saved");
    } catch (reason) {
      onError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Tick the exams this teacher may enter marks for in {data.year.label}. Unticking stops future mark entry. Marks already entered are kept.</p>
      <div className="overflow-x-auto rounded-control border border-line">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Grade · Subject</th>
              {data.exams.map((exam) => <th key={exam.id} className="px-3 py-2 text-center">{exam.name}</th>)}
            </tr>
          </thead>
          <tbody className="divide-line">
            {data.rows.map((row) => (
              <tr key={`${row.grade}-${row.subject}`}>
                <td className="px-3 py-2 text-ink">
                  {row.grade} · {row.title}
                  {!row.teaches && <span className="ml-1 text-xs text-muted">(not in responsibilities)</span>}
                </td>
                {data.exams.map((exam) => {
                  const key = `${exam.id}|${row.grade}|${row.subject}`;
                  const applies = !exam.grade || exam.grade === row.grade;
                  return (
                    <td key={exam.id} className="px-3 py-2 text-center">
                      {applies
                        ? <input type="checkbox" className="h-4 w-4" checked={granted.has(key)} onChange={() => toggle(key)} aria-label={`${exam.name}: ${row.grade} ${row.title}`} />
                        : <span className="text-muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-line pt-4">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save exam access"}</button>
      </div>
    </div>
  );
}

const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");

function Details({ teacher, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    name: teacher.name, username: teacher.username, email: teacher.email, phone: teacher.phone,
    subject: teacher.subject, qualification: teacher.qualification, gender: teacher.gender,
    address: teacher.address, experience: teacher.experience, bloodGroup: teacher.bloodGroup,
    designation: teacher.designation, employmentType: teacher.employmentType, dateOfJoining: dateInput(teacher.dateOfJoining),
  }));
  const [saving, setSaving] = useState(false);
  const locked = !teacher.canEditProfile;
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await api(`/api/teachers/${teacher._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await onSaved(payload.message || "Teacher updated");
    } catch (reason) {
      onError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, props = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <input className="input w-full" value={form[key] ?? ""} onChange={set(key)} {...props} />
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase text-muted">At your school</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("Designation", "designation", { placeholder: "e.g. Senior Teacher" })}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Employment</span>
            <select className="input w-full" value={form.employmentType} onChange={set("employmentType")}>
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </label>
          {field("Joined on", "dateOfJoining", { type: "date" })}
        </div>
      </fieldset>

      <fieldset className="space-y-3" disabled={locked}>
        <legend className="text-xs font-semibold uppercase text-muted">Login and personal details</legend>
        {locked && <p className="text-sm text-muted">This teacher also works at another school, so their name, login and personal details are kept by the teacher. You can change the school details above.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Full name *", "name", { required: !locked })}
          {field("Username", "username", { placeholder: "used to sign in" })}
          {field("Email *", "email", { type: "email", required: !locked })}
          {field("Phone", "phone", { type: "tel" })}
          {field("Main subject / focus area", "subject")}
          {field("Qualification", "qualification")}
          {field("Experience (years)", "experience", { type: "number", min: 0 })}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Gender</span>
            <select className="input w-full" value={form.gender || ""} onChange={set("gender")}>
              <option value="">Not set</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink">Blood group</span>
            <select className="input w-full" value={form.bloodGroup || ""} onChange={set("bloodGroup")}>
              <option value="">Not set</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
          </label>
          {field("Address", "address")}
        </div>
      </fieldset>

      <div className="flex justify-end border-t border-line pt-4">
        <button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}

function Account({ teacher, onSaved, onError }) {
  const [leaving, setLeaving] = useState(false);
  const [leftAt, setLeftAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState(null);

  const setStatus = async (status, extra = {}) => {
    setBusy(true);
    try {
      const payload = await api(`/api/teachers/${teacher._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      setLeaving(false);
      await onSaved(payload.message);
    } catch (reason) {
      onError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!window.confirm(`Reset ${teacher.name}'s password?\n\nTheir current password will stop working immediately. You will need to give them the new one.`)) return;
    setBusy(true);
    try {
      const payload = await api(`/api/teachers/${teacher._id}/password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setCredentials(payload.data.credentials);
    } catch (reason) {
      onError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  if (teacher.status === "LEFT") {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-ink">{teacher.name} left your school on <AppDate value={teacher.leftAt} fallback="—" />.</p>
        <p className="text-muted">Rejoining restores their access to your school. Assign their responsibilities again afterwards.</p>
        <button type="button" disabled={busy} onClick={() => setStatus("ACTIVE")} className="btn btn-primary">Rejoin teacher</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-2">
        <h3 className="font-semibold text-ink">Status at your school</h3>
        <p className="text-muted">
          {teacher.status === "ACTIVE"
            ? "Active: the teacher can sign in and see their classes, students and published results."
            : "Inactive: the teacher cannot sign in to your school. Their responsibilities are kept for when you activate them again."}
        </p>
        <div className="flex flex-wrap gap-2">
          {teacher.status === "ACTIVE"
            ? <button type="button" disabled={busy} onClick={() => setStatus("INACTIVE")} className="btn btn-secondary">Make inactive</button>
            : <button type="button" disabled={busy} onClick={() => setStatus("ACTIVE")} className="btn btn-primary">Activate</button>}
          <button type="button" disabled={busy} onClick={() => setLeaving(true)} className="btn btn-secondary">Mark as left</button>
        </div>
        {leaving && (
          <div className="space-y-3 rounded-control border border-warning-line bg-warning-soft p-3">
            <p className="text-ink">Marking as left removes {teacher.name}’s access to <strong>your school only</strong>. Their responsibilities are archived and exam mark entry is withdrawn. Nothing is deleted: past marks and results stay.{teacher.worksElsewhere ? " Their other school is not affected." : ""}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block font-medium text-ink">Leaving date</span><input type="date" className="input w-full" value={leftAt} onChange={(event) => setLeftAt(event.target.value)} /></label>
              <label className="block"><span className="mb-1 block font-medium text-ink">Note (optional)</span><input className="input w-full" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Transferred" /></label>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setStatus("LEFT", { leftAt, note })} className="btn btn-primary">Confirm: mark as left</button>
              <button type="button" onClick={() => setLeaving(false)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="font-semibold text-ink">Login</h3>
        <p className="text-muted">Signs in with <strong className="text-ink">{teacher.username || "—"}</strong> or <strong className="text-ink">{teacher.email}</strong> and their password.</p>
        <div className="flex flex-wrap gap-2">
          <a href={`/school/teachers/card?id=${teacher._id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Print login card</a>
          {teacher.canResetPassword && <button type="button" disabled={busy} onClick={resetPassword} className="btn btn-secondary">Reset password</button>}
        </div>
        <p className="text-xs text-muted">The login card has a QR with the teacher’s username. They upload a photo of it on the sign-in page, then type their password.</p>
        {!teacher.canResetPassword && <p className="text-muted">This teacher also works at another school, so only they can change their password.</p>}
        {credentials && <CredentialsCard credentials={credentials} />}
      </section>
    </div>
  );
}

export function CredentialsCard({ credentials }) {
  const text = `Pravyo teacher login\nUsername: ${credentials.username || "—"}\nEmail: ${credentials.email}\nPassword: ${credentials.password}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-control border border-success-line bg-success-soft p-3 text-sm">
      <p className="font-semibold text-ink">Share these login details with {credentials.name || "the teacher"}. The password is shown only once.</p>
      <dl className="mt-2 grid grid-cols-[6rem_1fr] gap-y-1 font-mono text-ink">
        <dt className="text-muted">Username</dt><dd className="break-all">{credentials.username || "—"}</dd>
        <dt className="text-muted">Email</dt><dd className="break-all">{credentials.email}</dd>
        <dt className="text-muted">Password</dt><dd className="break-all">{credentials.password}</dd>
      </dl>
      <button
        type="button"
        className="btn btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"
        onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {})}
      >
        <Copy size={14} aria-hidden /> {copied ? "Copied" : "Copy login details"}
      </button>
    </div>
  );
}
