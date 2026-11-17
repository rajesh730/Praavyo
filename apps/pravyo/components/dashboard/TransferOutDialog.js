"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import AlertBanner from "@/components/ui/AlertBanner";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Transfer out: record that a student moved to a school that is NOT on
 * Praavyo. (A move to a Praavyo school goes through Student Transfer, where
 * the new school admits the student.) The rules are in lib/studentTransferOut.js.
 */
export default function TransferOutDialog({ student, onClose, onDone }) {
  const [form, setForm] = useState({
    toSchoolName: "",
    toSchoolIemisNumber: "",
    toSchoolAddress: "",
    transferDate: today(),
    certificateNumber: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/students/${student._id}/transfer-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not transfer the student out.");
      onDone(data.message || `${student.name} was transferred out.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={saving ? () => {} : onClose} title={`Transfer out: ${student.name}`}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">
          For a school that is <strong>not on Praavyo</strong>. {student.name} leaves your roster, class lists,
          exams and notices, and you can no longer edit their record. Their results, writing and certificates stay
          as history, and their guardians can still view them.
        </p>
        <p className="rounded-control bg-surface-2 px-3 py-2 text-xs text-muted">
          Moving to a school on Praavyo? Use Student Transfer instead, so the new school admits them with their
          history.
        </p>

        <label className="block">
          <span className="label">New school name *</span>
          <input className="input" value={form.toSchoolName} onChange={set("toSchoolName")} required maxLength={200} autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">New school IEMIS number</span>
            <input className="input" value={form.toSchoolIemisNumber} onChange={set("toSchoolIemisNumber")} maxLength={50} placeholder="If known" />
          </label>
          <label className="block">
            <span className="label">Transfer date *</span>
            <input className="input" type="date" value={form.transferDate} max={today()} onChange={set("transferDate")} required />
          </label>
        </div>
        <label className="block">
          <span className="label">New school address</span>
          <input className="input" value={form.toSchoolAddress} onChange={set("toSchoolAddress")} maxLength={200} placeholder="Place, district" />
        </label>
        <label className="block">
          <span className="label">Transfer certificate number</span>
          <input className="input" value={form.certificateNumber} onChange={set("certificateNumber")} maxLength={60} />
        </label>
        <label className="block">
          <span className="label">Reason or note</span>
          <textarea className="input" rows={2} value={form.reason} onChange={set("reason")} maxLength={500} />
        </label>

        {error && <AlertBanner type="error" message={error} />}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-danger btn-sm">
            {saving ? "Transferring…" : "Transfer out"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
