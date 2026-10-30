"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useRememberedState } from "@pravyo/ui/rememberedState";

const EMPTY_FORM = {
  id: "", titleEn: "", titleNe: "", code: "", creditHours: "",
  taught: true, examined: true, kind: "COMPULSORY", optionalGroup: "", sections: [],
};

async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function UsageBadges({ subject }) {
  return (
    <div className="flex flex-wrap gap-1">
      {subject.taught && <span className="badge badge-neutral text-xs">Taught</span>}
      {subject.examined ? <span className="badge badge-brand text-xs">Examined (CAS)</span> : <span className="badge badge-neutral text-xs">Not examined</span>}
      {subject.kind === "OPTIONAL" && <span className="badge badge-warning text-xs">Optional · {subject.optionalGroup}</span>}
    </div>
  );
}

/**
 * Manage Subjects — the school's single subject register for every grade.
 * Daily teaching and CAS read the same subjects; CAS shows only the examined
 * ones. Optional subjects are assigned to students by the school.
 */
export default function SubjectManager() {
  const [data, setData] = useState(null);
  const [grade, setGrade] = useRememberedState("subjects:grade", "");
  const [form, setForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => api("/api/school/subjects")
    .then((payload) => setData(payload.data))
    .catch((error) => setNotice({ type: "error", title: "Subjects could not be loaded", message: error.message })), []);

  useEffect(() => { load(); }, [load]);

  const grades = data?.grades || [];
  const current = grades.find((row) => row.grade === grade) || grades[0] || null;
  const subjects = useMemo(() => current?.subjects || [], [current]);
  const groups = useMemo(() => [...new Set(subjects.filter((s) => s.kind === "OPTIONAL").map((s) => s.optionalGroup))], [subjects]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const body = { ...form, grade: current.grade };
      const payload = form.id
        ? await api("/api/school/subjects", "PATCH", body)
        : await api("/api/school/subjects", "POST", body);
      setNotice({ type: "success", title: payload.message });
      setForm(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", title: "Not saved", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const payload = await api("/api/school/subjects", "DELETE", { id: pendingDelete.id });
      setNotice({ type: "success", title: payload.message });
      setPendingDelete(null);
      await load();
    } catch (error) {
      setNotice({ type: "error", title: "Not deleted", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  if (!data && !notice) return <p className="p-4 text-sm text-muted sm:p-5">Loading subjects...</p>;

  return (
    <section className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-ink"><BookOpen size={20} aria-hidden /> Manage Subjects</h1>
          <p className="mt-1 text-sm text-muted">
            One subject list for daily teaching and CAS. Mark a subject <strong>Examined</strong> to use it in CAS assessment and results.
          </p>
        </div>
        {current && (
          <label className="flex items-center gap-2 text-sm font-semibold text-muted">
            Grade
            <select className="input min-w-36" value={current.grade} onChange={(event) => { setGrade(event.target.value); setForm(null); }}>
              {grades.map((row) => <option key={row.grade} value={row.grade}>{row.grade}</option>)}
            </select>
          </label>
        )}
      </header>

      {notice && <AlertBanner type={notice.type} title={notice.title} message={notice.message} />}

      {current && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <h2 className="font-semibold text-ink">{current.grade} · {subjects.length} subject{subjects.length === 1 ? "" : "s"}</h2>
            <button type="button" className="btn btn-primary btn-sm inline-flex items-center gap-1.5" onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus size={14} aria-hidden /> Add subject
            </button>
          </div>
          {subjects.length === 0 ? (
            <p className="p-4 text-sm text-muted">No subjects registered for {current.grade} yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-2 text-xs text-muted">
                  <tr><th className="px-4 py-2">Subject</th><th className="px-4 py-2">Use</th><th className="px-4 py-2">Sections</th><th className="px-4 py-2">Teachers</th><th className="px-4 py-2 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-line">
                  {subjects.map((subject) => (
                    <tr key={subject.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-ink">{subject.titleEn}</div>
                        <div className="text-xs text-muted">{subject.titleNe ? `${subject.titleNe} · ` : ""}{subject.code}{subject.creditHours != null ? ` · ${subject.creditHours} credit hrs` : ""}</div>
                      </td>
                      <td className="px-4 py-2.5"><UsageBadges subject={subject} /></td>
                      <td className="px-4 py-2.5 text-muted">{subject.sections.length ? subject.sections.join(", ") : "All sections"}</td>
                      <td className="px-4 py-2.5 text-muted">{subject.teachers}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <button type="button" className="btn-icon btn-ghost" aria-label={`Edit ${subject.titleEn}`} onClick={() => setForm({ ...EMPTY_FORM, ...subject, creditHours: subject.creditHours ?? "" })}><Pencil size={16} /></button>
                          <button type="button" className="btn-icon btn-ghost text-danger" aria-label={`Delete ${subject.titleEn}`} onClick={() => setPendingDelete(subject)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {form && current && (
        <form onSubmit={save} className="card space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{form.id ? `Edit ${form.titleEn}` : `Add subject to ${current.grade}`}</h2>
            <button type="button" className="btn-icon btn-ghost" aria-label="Close" onClick={() => setForm(null)}><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block font-medium text-ink">Name (English) *</span>
              <input className="input w-full" required maxLength={120} value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} placeholder="e.g. Our Surrounding" /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium text-ink">Name (Nepali)</span>
              <input className="input w-full" maxLength={120} value={form.titleNe} onChange={(e) => setForm({ ...form, titleNe: e.target.value })} placeholder="e.g. हाम्रो सेरोफेरो" /></label>
            {!form.id && (
              <label className="block text-sm"><span className="mb-1 block font-medium text-ink">Code</span>
                <input className="input w-full" maxLength={20} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Leave blank to create one" /></label>
            )}
            <label className="block text-sm"><span className="mb-1 block font-medium text-ink">Credit hours (for CAS GPA)</span>
              <input className="input w-full" type="number" min={0} max={40} step="0.5" value={form.creditHours} onChange={(e) => setForm({ ...form, creditHours: e.target.value })} /></label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Use</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.taught} onChange={(e) => setForm({ ...form, taught: e.target.checked })} /> Taught in daily classes</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.examined} onChange={(e) => setForm({ ...form, examined: e.target.checked })} /> Examined — used in CAS assessment and results</label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Type</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="kind" checked={form.kind === "COMPULSORY"} onChange={() => setForm({ ...form, kind: "COMPULSORY" })} /> Compulsory</label>
              <label className="flex items-center gap-2"><input type="radio" name="kind" checked={form.kind === "OPTIONAL"} onChange={() => setForm({ ...form, kind: "OPTIONAL" })} /> Optional</label>
            </div>
            {form.kind === "OPTIONAL" && (
              <label className="block text-sm"><span className="mb-1 block text-muted">Optional group — students get one subject from each group</span>
                <input className="input w-full sm:w-72" list="optional-groups" maxLength={60} value={form.optionalGroup} onChange={(e) => setForm({ ...form, optionalGroup: e.target.value })} placeholder="e.g. Optional I" />
                <datalist id="optional-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist>
              </label>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">Sections</legend>
            {current.sections.length === 0 ? (
              <p className="text-sm text-muted">{current.grade} has no sections, so every student of the grade takes it.</p>
            ) : (
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.sections.length === 0} onChange={() => setForm({ ...form, sections: [] })} /> All sections</label>
                {current.sections.map((name) => (
                  <label key={name} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.sections.includes(name)}
                      onChange={(e) => setForm({ ...form, sections: e.target.checked ? [...form.sections, name] : form.sections.filter((s) => s !== name) })}
                    /> Section {name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Saving..." : form.id ? "Save subject" : "Add subject"}</button>
          </div>
        </form>
      )}

      {current && groups.length > 0 && <OptionalAssignments grade={current.grade} sections={current.sections} onSaved={load} />}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Delete ${pendingDelete.titleEn} from ${pendingDelete.grade}?` : ""}
        message={pendingDelete
          ? `${pendingDelete.teachers ? `${pendingDelete.teachers} teacher assignment${pendingDelete.teachers === 1 ? "" : "s"} and any exam mark-entry access for it will be removed. ` : ""}${pendingDelete.students ? `${pendingDelete.students} student${pendingDelete.students === 1 ? " loses" : "s lose"} it as an optional subject. ` : ""}Marks already recorded and published results are kept.`
          : ""}
        confirmLabel="Delete subject"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => !busy && setPendingDelete(null)}
      />
    </section>
  );
}

/** The school assigns each student one subject per optional group. */
function OptionalAssignments({ grade, sections, onSaved }) {
  const [section, setSection] = useRememberedState(`subjects:${grade}:section`, "");
  const [payload, setPayload] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams({ grade, ...(section ? { section } : {}) });
    api(`/api/school/subjects/choices?${params}`)
      .then((result) => {
        setPayload(result.data);
        setDraft(Object.fromEntries(result.data.students.map((student) => [student.id, student.choices])));
      })
      .catch((error) => setNotice({ type: "error", title: "Could not load students", message: error.message }));
  }, [grade, section]);

  const pick = (student, group, subjectId) => {
    const groupIds = new Set(group.subjects.map((s) => s.id));
    setDraft((current) => {
      const rest = (current[student.id] || []).filter((id) => !groupIds.has(id));
      return { ...current, [student.id]: subjectId ? [...rest, subjectId] : rest };
    });
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const result = await api("/api/school/subjects/choices", "PUT", {
        grade,
        assignments: payload.students.map((student) => ({ student: student.id, subjects: draft[student.id] || [] })),
      });
      setNotice({ type: "success", title: result.message });
      onSaved?.();
    } catch (error) {
      setNotice({ type: "error", title: "Not saved", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">Optional subjects for students</h2>
          <p className="mt-1 text-sm text-muted">Choose which optional subject each student takes. Results count only the subjects a student takes.</p>
        </div>
        {sections.length > 0 && (
          <select className="input sm:w-48" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Filter by section">
            <option value="">All sections</option>
            {sections.map((name) => <option key={name} value={name}>Section {name}</option>)}
          </select>
        )}
      </div>
      {notice && <div className="p-4 pb-0"><AlertBanner type={notice.type} title={notice.title} message={notice.message} /></div>}
      {!payload ? <p className="p-4 text-sm text-muted">Loading students...</p> : payload.students.length === 0 ? (
        <p className="p-4 text-sm text-muted">No current students in {grade}{section ? ` section ${section}` : ""}.</p>
      ) : (
        <>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-muted">
                <tr><th className="px-4 py-2">Roll</th><th className="px-4 py-2">Student</th>{payload.groups.map((group) => <th key={group.group} className="px-4 py-2">{group.group}</th>)}</tr>
              </thead>
              <tbody className="divide-line">
                {payload.students.map((student) => (
                  <tr key={student.id}>
                    <td className="px-4 py-2 text-muted">{student.rollNumber || "—"}</td>
                    <td className="px-4 py-2 font-medium text-ink">{student.name}{student.section ? <span className="ml-1 text-xs text-muted">({student.section})</span> : null}</td>
                    {payload.groups.map((group) => {
                      const options = group.subjects.filter((s) => !s.sections.length || s.sections.includes(student.section));
                      const value = (draft[student.id] || []).find((id) => group.subjects.some((s) => s.id === id)) || "";
                      return (
                        <td key={group.group} className="px-4 py-2">
                          <select className="input w-full" value={value} onChange={(e) => pick(student, group, e.target.value)} aria-label={`${group.group} for ${student.name}`}>
                            <option value="">Not assigned</option>
                            {options.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-line p-4">
            <button type="button" disabled={saving} onClick={save} className="btn btn-primary">{saving ? "Saving..." : "Save optional subjects"}</button>
          </div>
        </>
      )}
    </div>
  );
}
