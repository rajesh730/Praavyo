"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

async function call(method, body) {
  const response = await fetch("/api/school/sections", {
    method,
    cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not update sections.");
  return data;
}

/**
 * Manage Sections — the one list every section dropdown in Pravyo and CAS
 * reads. Each change saves immediately; deleting asks first and says how many
 * current students will move to "No section". Published results keep the
 * section they were issued under.
 */
export default function SectionManager() {
  const [grades, setGrades] = useState([]);
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [drafts, setDrafts] = useState({});
  const [renaming, setRenaming] = useState(null); // { grade, from, to }
  const [pendingDelete, setPendingDelete] = useState(null); // { grade, name, students }
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => call("GET")
    .then((data) => {
      setGrades(data.grades || []);
      setRows(data.sections || []);
      setCounts(Object.fromEntries((data.students || []).map((row) => [row.grade, row.counts || {}])));
    })
    .catch((error) => setNotice({ type: "error", title: "Sections could not be loaded", message: error.message }))
    .finally(() => setLoading(false)), []);

  useEffect(() => { load(); }, [load]);

  const run = async (method, body, success) => {
    setBusy(true);
    setNotice(null);
    try {
      const data = await call(method, body);
      setNotice({ type: "success", title: data.message || success });
      await load();
      return true;
    } catch (error) {
      setNotice({ type: "error", title: "Not saved", message: error.message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (grade) => {
    const name = String(drafts[grade] || "").trim();
    if (!name) return;
    if (await run("POST", { grade, name }, "Section added")) setDrafts((value) => ({ ...value, [grade]: "" }));
  };

  const rename = async () => {
    const to = String(renaming?.to || "").trim();
    if (!to || to === renaming.from) { setRenaming(null); return; }
    if (await run("PATCH", { grade: renaming.grade, from: renaming.from, to }, "Section renamed")) setRenaming(null);
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (await run("DELETE", { grade: target.grade, name: target.name }, "Section deleted")) setPendingDelete(null);
  };

  if (loading) return <p className="p-4 text-sm text-muted sm:p-5">Loading sections...</p>;

  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4 sm:p-5">
      <header>
        <h1 className="font-semibold text-ink">Manage Sections</h1>
        <p className="mt-1 text-sm text-muted">
          The sections listed here are the only ones shown anywhere in Pravyo and CAS. Changes save immediately.
          Published results keep the section they were issued under, even after it is deleted.
        </p>
      </header>

      {notice && <AlertBanner type={notice.type} title={notice.title} message={notice.message} />}

      {grades.map((grade) => {
        const sections = rows.find((row) => row.grade === grade)?.sections || [];
        return (
          <div key={grade} className="border-b border-line py-4">
            <h2 className="font-semibold text-ink">{grade}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {sections.length === 0 && <span className="text-sm text-muted">No sections</span>}
              {sections.map((name) => {
                const students = counts[grade]?.[name] || 0;
                const editing = renaming?.grade === grade && renaming?.from === name;
                return editing ? (
                  <form key={name} onSubmit={(event) => { event.preventDefault(); rename(); }} className="flex items-center gap-1">
                    <input
                      autoFocus
                      maxLength={40}
                      value={renaming.to}
                      onChange={(event) => setRenaming((value) => ({ ...value, to: event.target.value }))}
                      aria-label={`New name for ${grade} section ${name}`}
                      className="input w-28"
                    />
                    <button type="submit" disabled={busy} className="btn-icon btn-ghost" aria-label="Save name"><Check size={16} /></button>
                    <button type="button" onClick={() => setRenaming(null)} className="btn-icon btn-ghost" aria-label="Cancel rename"><X size={16} /></button>
                  </form>
                ) : (
                  <span key={name} className="inline-flex items-center gap-1 rounded-control border border-line-strong bg-surface py-1 pl-3 pr-1 text-sm text-ink">
                    <span className="font-semibold">{name}</span>
                    <span className="ml-1 text-xs text-muted">{students} student{students === 1 ? "" : "s"}</span>
                    <button
                      type="button"
                      onClick={() => setRenaming({ grade, from: name, to: name })}
                      disabled={busy}
                      className="btn-icon btn-ghost btn-sm"
                      aria-label={`Rename ${grade} section ${name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ grade, name, students })}
                      disabled={busy}
                      className="btn-icon btn-ghost btn-sm text-danger"
                      aria-label={`Delete ${grade} section ${name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                );
              })}
              <form onSubmit={(event) => { event.preventDefault(); add(grade); }} className="flex gap-2">
                <input
                  maxLength={40}
                  value={drafts[grade] || ""}
                  onChange={(event) => setDrafts((value) => ({ ...value, [grade]: event.target.value }))}
                  aria-label={`New section for ${grade}`}
                  placeholder="Add section"
                  className="input w-36"
                />
                <button type="submit" disabled={busy || !String(drafts[grade] || "").trim()} className="btn btn-secondary font-semibold">Add</button>
              </form>
            </div>
          </div>
        );
      })}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `Delete section ${pendingDelete.name} of ${pendingDelete.grade}?` : ""}
        message={pendingDelete
          ? pendingDelete.students
            ? `${pendingDelete.students} current student${pendingDelete.students === 1 ? "" : "s"} will be moved to "No section". Published results keep this section in their history.`
            : "No current student is in this section. Published results keep it in their history."
          : ""}
        confirmLabel="Delete section"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => !busy && setPendingDelete(null)}
      />
    </section>
  );
}
