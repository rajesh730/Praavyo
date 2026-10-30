"use client";

import { useCallback, useEffect, useState } from "react";
import { Check as FaCheck, ArrowLeftRight as FaExchangeAlt, X as FaTimes } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";

function schoolName(school) {
  return school?.schoolName || school?.name || "School";
}

function studentName(transfer) {
  return transfer.student?.name || transfer.studentNameSnapshot || "Student";
}

export default function StudentTransferPanel({ grades = [], onChanged }) {
  const [open, setOpen] = useState(false);
  const [transfers, setTransfers] = useState({
    releaseRequests: [],
    releasedTransfers: [],
    admissionRequests: [],
    incoming: [],
    outgoing: [],
  });
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [admissionDrafts, setAdmissionDrafts] = useState({});
  const [rollInfo, setRollInfo] = useState({});
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/students/transfer", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setTransfers({
          releaseRequests: json.data?.releaseRequests || [],
          releasedTransfers: json.data?.releasedTransfers || [],
          admissionRequests: json.data?.admissionRequests || [],
          incoming: json.data?.incoming || [],
          outgoing: json.data?.outgoing || [],
        });
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const releaseRequests = transfers.releaseRequests || [];
  const releasedTransfers = transfers.releasedTransfers || [];
  const admissionRequests = transfers.admissionRequests || [];
  const legacyIncoming = (transfers.incoming || []).filter((t) => t.status === "PENDING");
  const legacyOutgoing = (transfers.outgoing || []).filter((t) => t.status === "PENDING");
  const pendingCount =
    releaseRequests.length +
    releasedTransfers.length +
    admissionRequests.length +
    legacyIncoming.length +
    legacyOutgoing.length;

  const decide = async (id, action, body = {}) => {
    try {
      setBusyId(id);
      setFeedback(null);
      const res = await fetch(`/api/students/transfer/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Action failed");
      setFeedback({ type: "success", title: "Transfer updated", message: json.message });
      await load();
      onChanged?.();
    } catch (error) {
      setFeedback({ type: "error", title: "Action failed", message: error.message });
    } finally {
      setBusyId("");
    }
  };

  const updateAdmissionDraft = (id, patch) => {
    setAdmissionDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const openReject = (id, action) => {
    setRejectTarget({ id, action });
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const { id, action } = rejectTarget;
    const reason = rejectReason.trim();
    setRejectTarget(null);
    setRejectReason("");
    await decide(id, action, { reason });
  };

  // Inline reason box shown under a row's Reject button before confirming.
  const renderRejectBox = (transfer) => {
    if (rejectTarget?.id !== transfer._id) return null;
    return (
      <div className="mt-3 rounded-control border border-danger-line bg-danger-soft p-3">
        <label className="block text-xs font-semibold text-danger">
          Reason for rejection (shared with the student)
        </label>
        <textarea
          value={rejectReason}
          maxLength={300}
          autoFocus
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="e.g. Dues pending, please clear before transfer."
          className="input input-invalid mt-1 w-full"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setRejectTarget(null);
              setRejectReason("");
            }}
            className="btn btn-secondary btn-sm inline-flex items-center"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busyId === transfer._id}
            onClick={confirmReject}
            className="btn btn-danger btn-sm inline-flex items-center"
          >
            Confirm Reject
          </button>
        </div>
      </div>
    );
  };

  // Ask the server for the next free roll number in a grade and prefill it,
  // unless the admin has already typed one. Also stores the taken numbers so the
  // UI can warn before submitting (instead of failing on the server).
  const loadRollSuggestion = useCallback(async (transferId, grade) => {
    if (!grade) return;
    try {
      const res = await fetch(
        `/api/students/transfer/roll-suggestion?grade=${encodeURIComponent(grade)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) return;
      const suggested = json.data?.suggestedRollNumber || "";
      const taken = json.data?.takenRollNumbers || [];
      setRollInfo((prev) => ({ ...prev, [transferId]: { suggested, taken } }));
      setAdmissionDrafts((prev) => {
        const current = prev[transferId] || {};
        if (current.toRollNumber) return prev;
        return { ...prev, [transferId]: { ...current, toRollNumber: suggested } };
      });
    } catch {
      // non-fatal — admin can still type a roll number manually
    }
  }, []);

  const handleGradeChange = (transferId, grade) => {
    updateAdmissionDraft(transferId, { toGrade: grade, toRollNumber: "" });
    setRollInfo((prev) => {
      const next = { ...prev };
      delete next[transferId];
      return next;
    });
    void loadRollSuggestion(transferId, grade);
  };

  // Prefill a suggestion for each incoming admission once it appears.
  const admissionIds = admissionRequests.map((t) => t._id).join(",");
  useEffect(() => {
    admissionRequests.forEach((transfer) => {
      if (rollInfo[transfer._id]) return;
      const grade =
        admissionDrafts[transfer._id]?.toGrade ?? transfer.student?.grade ?? "";
      if (grade) void loadRollSuggestion(transfer._id, grade);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionIds]);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-soft text-brand">
            <FaExchangeAlt />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink">
              Student Transfers
            </span>
            <span className="block text-xs text-muted">
              Approve release requests and admit students joining your school.
            </span>
          </span>
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-2xs font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {feedback && (
        <div className="mt-3">
          <AlertBanner type={feedback.type} title={feedback.title} message={feedback.message} />
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="card p-4">
            <p className="text-sm font-semibold text-ink">
              Transfer Approvals ({releaseRequests.length})
            </p>
            <p className="mt-1 text-xs text-muted">
              Students from your school requesting a transfer code.
            </p>
            <div className="mt-3 space-y-2">
              {releaseRequests.length === 0 ? (
                <p className="text-xs text-muted">No release requests.</p>
              ) : (
                releaseRequests.map((transfer) => (
                  <div
                    key={transfer._id}
                    className="card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {studentName(transfer)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {transfer.student?.grade || "Grade not set"} · Roll{" "}
                          {transfer.student?.rollNumber || "not set"}
                        </p>
                        {transfer.reason && (
                          <p className="mt-2 text-xs leading-5 text-muted">
                            {transfer.reason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === transfer._id}
                          onClick={() => decide(transfer._id, "approve_release")}
                          className="btn btn-primary btn-sm inline-flex items-center gap-1"
                        >
                          <FaCheck /> Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === transfer._id}
                          onClick={() => openReject(transfer._id, "reject_release")}
                          className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                        >
                          <FaTimes /> Reject
                        </button>
                      </div>
                    </div>
                    {renderRejectBox(transfer)}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-4">
            <p className="text-sm font-semibold text-ink">
              Released Transfers ({releasedTransfers.length})
            </p>
            <p className="mt-1 text-xs text-muted">
              Transfer codes already issued. You can cancel until another school admits the student.
            </p>
            <div className="mt-3 space-y-2">
              {releasedTransfers.length === 0 ? (
                <p className="text-xs text-muted">No active released transfers.</p>
              ) : (
                releasedTransfers.map((transfer) => (
                  <div
                    key={transfer._id}
                    className="card p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {studentName(transfer)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Code {transfer.transferCode || "issued"} ·{" "}
                          {transfer.status === "PENDING_ADMISSION"
                            ? `Waiting for ${schoolName(transfer.toSchool)}`
                            : "Waiting for student to choose school"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === transfer._id}
                        onClick={() => decide(transfer._id, "cancel")}
                        className="btn btn-secondary btn-sm inline-flex shrink-0 items-center gap-1"
                      >
                        Cancel Transfer
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-4">
            <p className="text-sm font-semibold text-ink">
              Incoming Admissions ({admissionRequests.length})
            </p>
            <p className="mt-1 text-xs text-muted">
              Released students asking to join your school.
            </p>
            <div className="mt-3 space-y-3">
              {admissionRequests.length === 0 ? (
                <p className="text-xs text-muted">No admission requests.</p>
              ) : (
                admissionRequests.map((transfer) => {
                  const draft = admissionDrafts[transfer._id] || {};
                  const toGrade = draft.toGrade ?? transfer.student?.grade ?? "";
                  const toRollNumber = draft.toRollNumber ?? "";
                  const info = rollInfo[transfer._id];
                  const trimmedRoll = String(toRollNumber).trim();
                  const rollTaken = Boolean(
                    info?.taken?.includes(trimmedRoll) && trimmedRoll
                  );

                  return (
                    <div
                      key={transfer._id}
                      className="card p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {studentName(transfer)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          From {schoolName(transfer.fromSchool)} · Code{" "}
                          {transfer.transferCode || "issued"}
                        </p>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {grades.length > 0 ? (
                          <select
                            value={toGrade}
                            onChange={(e) =>
                              handleGradeChange(transfer._id, e.target.value)
                            }
                            className="input"
                          >
                            <option value="">Select grade</option>
                            {grades.map((grade) => (
                              <option key={grade} value={grade}>
                                {grade}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={toGrade}
                            onChange={(e) =>
                              handleGradeChange(transfer._id, e.target.value)
                            }
                            placeholder="Grade"
                            className="input"
                          />
                        )}
                        <input
                          value={toRollNumber}
                          onChange={(e) =>
                            updateAdmissionDraft(transfer._id, {
                              toRollNumber: e.target.value,
                            })
                          }
                          placeholder="Roll number"
                          className={`input ${
                            rollTaken ? "input input-invalid" : "input"
                          }`}
                        />
                      </div>
                      {toGrade && (
                        <div className="mt-2 text-xs">
                          {rollTaken ? (
                            <p className="font-semibold text-danger">
                              Roll number {trimmedRoll} is already used in{" "}
                              {toGrade}.{" "}
                              {info?.suggested && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAdmissionDraft(transfer._id, {
                                      toRollNumber: info.suggested,
                                    })
                                  }
                                  className="font-semibold text-brand-strong underline"
                                >
                                  Use {info.suggested}
                                </button>
                              )}
                            </p>
                          ) : (
                            info?.suggested && (
                              <p className="text-muted">
                                Next available in {toGrade}:{" "}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAdmissionDraft(transfer._id, {
                                      toRollNumber: info.suggested,
                                    })
                                  }
                                  className="font-semibold text-brand-strong underline"
                                >
                                  {info.suggested}
                                </button>
                              </p>
                            )
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === transfer._id}
                          onClick={() => openReject(transfer._id, "reject_admission")}
                          className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={
                            busyId === transfer._id ||
                            !toGrade ||
                            !trimmedRoll ||
                            rollTaken
                          }
                          onClick={() =>
                            decide(transfer._id, "approve_admission", {
                              toGrade,
                              toRollNumber: trimmedRoll,
                            })
                          }
                          className="btn btn-primary btn-sm inline-flex items-center gap-1"
                        >
                          Admit Student
                        </button>
                      </div>
                      {renderRejectBox(transfer)}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {(legacyIncoming.length > 0 || legacyOutgoing.length > 0) && (
            <div className="rounded-card border border-warning-line bg-warning-soft p-4 xl:col-span-2">
              <p className="text-sm font-semibold text-warning">
                Legacy transfer requests
              </p>
              <p className="mt-1 text-xs text-warning">
                These were created before the student-initiated transfer flow.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
