"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { ArrowLeftRight, Search, X } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import AppDate from "@/components/common/AppDate";
import LoadingState from "@/components/ui/LoadingState";

/**
 * The school's student transfers, in one table.
 *
 *   Needs action — a family asked to take a child away (approve release), or
 *                  a released child wants to join (admit with grade + roll)
 *   In progress  — released by us; the family is choosing / the new school
 *                  is deciding. We can still cancel.
 *   History      — finished either way (completed, rejected, cancelled)
 *
 * Transfers are requested by the parent in the parent app. Admitting and
 * rejecting open a small dialog; everything else is one click.
 */

const VIEWS = [
  { id: "action", label: "Needs action" },
  { id: "progress", label: "In progress" },
  { id: "history", label: "History" },
];

const FINAL = {
  COMPLETED: { label: "Completed", tone: "badge-success" },
  APPROVED: { label: "Completed", tone: "badge-success" },
  REJECTED: { label: "Rejected", tone: "badge-danger" },
  CANCELLED: { label: "Cancelled", tone: "badge-neutral" },
};

const schoolName = (school) => school?.schoolName || school?.name || "";
const studentName = (transfer) => transfer.student?.name || transfer.studentNameSnapshot || "Student";
// The student's government IEMIS number: live from the record, or the copy the
// transfer kept when it was made.
const studentIemis = (transfer) => transfer.student?.iemisNumber || transfer.studentIemisNumber || "";

/** One row shape for every kind of transfer. */
function toRow(transfer, kind, mySchoolId) {
  const leaving = kind === "release" || kind === "released" || String(transfer.fromSchool?._id || transfer.fromSchool || "") === String(mySchoolId || "");
  const otherSchool = leaving ? schoolName(transfer.toSchool) : schoolName(transfer.fromSchool) || transfer.fromSchoolNameSnapshot || "";
  let stage;
  let tone = "badge-warning";
  if (kind === "release") stage = "Waiting for your approval";
  else if (kind === "admission") stage = "Waiting for you to admit";
  else if (kind === "released") {
    tone = "badge-brand";
    stage = transfer.status === "PENDING_ADMISSION"
      ? `Waiting for ${schoolName(transfer.toSchool) || "the new school"}`
      : "Released · family choosing a school";
  } else {
    stage = FINAL[transfer.status]?.label || transfer.status;
    tone = FINAL[transfer.status]?.tone || "badge-neutral";
  }
  return {
    id: String(transfer._id),
    kind,
    transfer,
    name: studentName(transfer),
    iemis: studentIemis(transfer),
    detail: [
      studentIemis(transfer) && `IEMIS ${studentIemis(transfer)}`,
      transfer.student?.grade,
      transfer.student?.rollNumber && `Roll ${transfer.student.rollNumber}`,
    ].filter(Boolean).join(" · "),
    direction: leaving ? "LEAVING" : "JOINING",
    otherSchool,
    askedBy: transfer.requestedByParent?.name ? `Parent: ${transfer.requestedByParent.name}` : transfer.requestedByStudent ? "Student" : "",
    reason: transfer.reason || "",
    decisionReason: transfer.decisionReason || "",
    code: transfer.transferCode || "",
    date: transfer.updatedAt || transfer.createdAt,
    stage,
    tone,
  };
}

export default function StudentTransferPanel({ grades = [], onChanged, schoolId = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useRememberedState("transfers:view", "action");
  const [direction, setDirection] = useRememberedState("transfers:direction", "");
  const [query, setQuery] = useRememberedState("transfers:query", "");
  const [admitting, setAdmitting] = useState(null);
  const [rejecting, setRejecting] = useState(null);

  useEffect(() => {
    let live = true;
    fetch("/api/students/transfer", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Could not load transfers");
        if (live) setData(json.data || {});
      })
      .catch((error) => live && setFeedback({ type: "error", title: "Transfers", message: error.message }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const groups = useMemo(() => {
    const d = data || {};
    return {
      action: [
        ...(d.releaseRequests || []).map((t) => toRow(t, "release", schoolId)),
        ...(d.admissionRequests || []).map((t) => toRow(t, "admission", schoolId)),
      ],
      progress: (d.releasedTransfers || []).map((t) => toRow(t, "released", schoolId)),
      history: (d.history || []).map((t) => toRow(t, "history", schoolId)),
    };
  }, [data, schoolId]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (groups[view] || []).filter(
      (row) =>
        (!direction || row.direction === direction) &&
        (!term
          || row.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(term))
          || row.iemis.toLowerCase().startsWith(term.replace(/\s+/g, "")))
    );
  }, [groups, view, direction, query]);

  const act = async (row, action, body = {}) => {
    setBusyId(row.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/students/transfer/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Action failed");
      setFeedback({ type: "success", title: "Transfer updated", message: json.message });
      reload();
      onChanged?.();
      return true;
    } catch (error) {
      setFeedback({ type: "error", title: "Action failed", message: error.message });
      return false;
    } finally {
      setBusyId("");
    }
  };

  const actions = (row) => {
    const busy = busyId === row.id;
    if (row.kind === "release") {
      return (
        <>
          <button type="button" disabled={busy} onClick={() => act(row, "approve_release")} className="btn btn-primary btn-sm whitespace-nowrap">
            Approve release
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting({ row, action: "reject_release" })} className="btn btn-ghost btn-sm whitespace-nowrap">
            Reject
          </button>
        </>
      );
    }
    if (row.kind === "admission") {
      return (
        <>
          <button type="button" disabled={busy} onClick={() => setAdmitting(row)} className="btn btn-primary btn-sm whitespace-nowrap">
            Admit
          </button>
          <button type="button" disabled={busy} onClick={() => setRejecting({ row, action: "reject_admission" })} className="btn btn-ghost btn-sm whitespace-nowrap">
            Reject
          </button>
        </>
      );
    }
    if (row.kind === "released") {
      return (
        <button type="button" disabled={busy}
          onClick={() => window.confirm(`Cancel the transfer of ${row.name}?\n\nThe transfer code stops working. The family would have to ask again.`) && act(row, "cancel")}
          className="btn btn-secondary btn-sm whitespace-nowrap">
          Cancel transfer
        </button>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {feedback && <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />}

      {/* views + filters, one line */}
      <div className="card flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
        <div role="tablist" aria-label="Transfers" className="grid grid-cols-3 rounded-control border border-line bg-surface-2 p-0.5 lg:mr-auto">
          {VIEWS.map((option) => {
            const count = (groups[option.id] || []).length;
            const on = view === option.id;
            return (
              <button key={option.id} type="button" role="tab" aria-selected={on} onClick={() => setView(option.id)}
                className={`min-h-9 rounded-control px-2 py-1 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}>
                {option.label}
                {count > 0 && (
                  <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-2xs font-bold ${option.id === "action" ? "bg-danger text-white" : "bg-line text-ink"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select className="input sm:w-40" value={direction} onChange={(e) => setDirection(e.target.value)} aria-label="Direction">
            <option value="">Leaving and joining</option>
            <option value="LEAVING">Leaving us</option>
            <option value="JOINING">Joining us</option>
          </select>
          <label className="relative block sm:w-60">
            <span className="sr-only">Search student</span>
            <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-full pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or IEMIS" />
          </label>
        </div>
      </div>

      {loading ? (
        <LoadingState title="Loading transfers" message="Checking requests from families and other schools." />
      ) : rows.length === 0 ? (
        <div className="card px-5 py-10 text-center">
          <ArrowLeftRight aria-hidden className="mx-auto text-subtle" size={28} />
          <p className="mt-3 font-semibold text-ink">
            {view === "action" ? "Nothing waiting for you" : view === "progress" ? "No transfers in progress" : "No past transfers"}
          </p>
          <p className="mt-1 text-sm text-muted">Parents request a transfer for their child from the parent app.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-line bg-surface-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Student</th>
                <th scope="col" className="px-4 py-3">Transfer</th>
                <th scope="col" className="px-4 py-3">Asked by</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-ink">{row.name}</span>
                    {row.detail && <span className="block text-xs text-muted">{row.detail}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${row.direction === "LEAVING" ? "badge-warning" : "badge-brand"}`}>
                      {row.direction === "LEAVING" ? "Leaving" : "Joining"}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {row.direction === "LEAVING" ? `To ${row.otherSchool || "— not chosen yet"}` : `From ${row.otherSchool || "another school"}`}
                    </span>
                    {row.code && <span className="block font-mono text-2xs text-muted">Code {row.code}</span>}
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <span className="block text-ink">{row.askedBy || "—"}</span>
                    {row.reason && <span className="block text-xs text-muted">“{row.reason}”</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${row.tone}`}>{row.stage}</span>
                    {row.decisionReason && view === "history" && <span className="mt-1 block text-xs text-muted">{row.decisionReason}</span>}
                    <span className="mt-1 block text-2xs text-subtle"><AppDate value={row.date} /></span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">{actions(row)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-line md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{row.name}</p>
                    {row.detail && <p className="text-xs text-muted">{row.detail}</p>}
                  </div>
                  <span className={`badge shrink-0 text-xs ${row.direction === "LEAVING" ? "badge-warning" : "badge-brand"}`}>
                    {row.direction === "LEAVING" ? "Leaving" : "Joining"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {row.direction === "LEAVING" ? `To ${row.otherSchool || "— not chosen yet"}` : `From ${row.otherSchool || "another school"}`}
                  {row.askedBy ? ` · ${row.askedBy}` : ""}
                </p>
                {row.reason && <p className="text-xs text-muted">“{row.reason}”</p>}
                <p><span className={`badge text-xs ${row.tone}`}>{row.stage}</span></p>
                <div className="flex flex-wrap gap-2 pt-1">{actions(row)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {admitting && (
        <AdmitDialog
          row={admitting}
          grades={grades}
          busy={busyId === admitting.id}
          onClose={() => setAdmitting(null)}
          onAdmit={async (toGrade, toRollNumber) => {
            if (await act(admitting, "approve_admission", { toGrade, toRollNumber })) setAdmitting(null);
          }}
        />
      )}

      {rejecting && (
        <RejectDialog
          row={rejecting.row}
          leaving={rejecting.action === "reject_release"}
          busy={busyId === rejecting.row.id}
          onClose={() => setRejecting(null)}
          onReject={async (reason) => {
            if (await act(rejecting.row, rejecting.action, { reason })) setRejecting(null);
          }}
        />
      )}
    </div>
  );
}

function Dialog({ title, subtitle, onClose, children }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" onClick={onClose}>
      <div className="modal-panel space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="transfer-dialog-title" className="text-base font-bold text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-icon btn-ghost btn-sm -mr-1 -mt-1" aria-label="Close"><X aria-hidden size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Admit a joining student: choose the grade; the next free roll is filled in. */
function AdmitDialog({ row, grades, busy, onClose, onAdmit }) {
  const [grade, setGrade] = useState(row.transfer.student?.grade || "");
  const [roll, setRoll] = useState("");
  const [info, setInfo] = useState({ grade: "", suggested: "", taken: [] });

  useEffect(() => {
    if (!grade) return undefined;
    let live = true;
    fetch(`/api/students/transfer/roll-suggestion?grade=${encodeURIComponent(grade)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!live || !json) return;
        const suggested = json.data?.suggestedRollNumber || "";
        setInfo({ grade, suggested, taken: json.data?.takenRollNumbers || [] });
        setRoll((current) => current || suggested);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [grade]);

  const trimmed = String(roll).trim();
  const taken = Boolean(trimmed && info.grade === grade && info.taken.includes(trimmed));

  return (
    <Dialog title={`Admit ${row.name}`} subtitle={`Joining from ${row.otherSchool || "another school"}. Choose where they sit in your school.`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-ink">Grade</span>
          {grades.length > 0 ? (
            <select className="input mt-1 w-full" value={grade} onChange={(e) => { setGrade(e.target.value); setRoll(""); }}>
              <option value="">Choose a grade</option>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          ) : (
            <input className="input mt-1 w-full" value={grade} onChange={(e) => { setGrade(e.target.value); setRoll(""); }} placeholder="Grade" />
          )}
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink">Roll number</span>
          <input className={`input mt-1 w-full ${taken ? "input-invalid" : ""}`} value={roll} onChange={(e) => setRoll(e.target.value)} placeholder="Roll number" />
        </label>
      </div>
      {grade && info.grade === grade && (
        <p className={`text-xs ${taken ? "font-semibold text-danger" : "text-muted"}`}>
          {taken ? `Roll ${trimmed} is already used in ${grade}. ` : info.suggested ? `Next free roll in ${grade}: ` : ""}
          {info.suggested && (
            <button type="button" onClick={() => setRoll(info.suggested)} className="font-semibold text-brand underline">
              {taken ? `Use ${info.suggested}` : info.suggested}
            </button>
          )}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button type="button" disabled={busy || !grade || !trimmed || taken} onClick={() => onAdmit(grade, trimmed)} className="btn btn-primary">
          {busy ? "Admitting…" : "Admit student"}
        </button>
      </div>
    </Dialog>
  );
}

function RejectDialog({ row, leaving, busy, onClose, onReject }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      title={leaving ? `Reject the transfer of ${row.name}?` : `Reject the admission of ${row.name}?`}
      subtitle={leaving ? "The child stays at your school." : "The family can then choose another school."}
      onClose={onClose}
    >
      <label className="block">
        <span className="text-sm font-semibold text-ink">Reason <span className="font-normal text-muted">(the family sees it)</span></span>
        <textarea className="input mt-1 min-h-24 w-full" value={reason} maxLength={300} autoFocus onChange={(e) => setReason(e.target.value)}
          placeholder={leaving ? "e.g. Please clear the pending fees first." : "e.g. No seats left in this grade."} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
        <button type="button" disabled={busy} onClick={() => onReject(reason.trim())} className="btn btn-danger">
          {busy ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </Dialog>
  );
}
