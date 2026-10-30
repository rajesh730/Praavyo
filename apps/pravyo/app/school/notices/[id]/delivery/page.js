"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Send as FaPaperPlane, Check as FaCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintButton from "@/components/school/PrintButton";

/**
 * Notice delivery overview and offline follow-up list (§37, §38, §39).
 *
 * Every figure here is counted from real receipt records — §37 forbids
 * inventing delivery success, so there is no "estimated reach" anywhere.
 *
 * The follow-up list is the part that makes offline families visible: rather
 * than disappearing from the school's view, a guardian with no digital channel
 * becomes a printable task with a name, a class and a phone number if one
 * exists.
 */
export default function NoticeDeliveryPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/school/notices/${id}/delivery`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not load");
      setState({ loading: false, data: json.data, error: "" });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async () => {
    setBusy(true);
    try {
      await fetch(`/api/school/notices/${id}/delivery`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const markPaper = async (row) => {
    await fetch(`/api/school/notices/${id}/delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "PAPER_DELIVERED",
        parentId: row.parentId,
        studentId: row.studentId,
      }),
    });
    await load();
  };

  if (state.loading) {
    return (
      <DashboardLayout>
        <div className="h-64 animate-pulse rounded-card bg-surface-2" />
      </DashboardLayout>
    );
  }

  if (!state.data) {
    return (
      <DashboardLayout>
        <p className="rounded-card bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      </DashboardLayout>
    );
  }

  const { notice, metrics, followUp } = state.data;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        <header className="no-print mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-semibold text-ink">
              {notice.title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Delivery overview · {notice.priority.toLowerCase()} priority
            </p>
          </div>
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            className="btn btn-primary flex items-center gap-2"
          >
            <FaPaperPlane aria-hidden="true" className="h-3.5 w-3.5" />
            {busy ? "Sending…" : "Send / resend"}
          </button>
        </header>

        <section className="no-print grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric value={metrics.guardians} label="Guardians" />
          <Metric value={metrics.opened} label="Opened" tone="emerald" />
          <Metric value={metrics.digitalUnread} label="Digital unread" tone="amber" />
          <Metric value={metrics.emailAvailable} label="Email available" tone="sky" />
          <Metric
            value={metrics.offlineFollowUp}
            label="Offline follow-up"
            tone="slate"
          />
          {notice.requiresAcknowledgement ? (
            <Metric value={metrics.acknowledged} label="Confirmed" tone="emerald" />
          ) : null}
          {notice.requiresConsent ? (
            <>
              <Metric value={metrics.consentYes} label="Said yes" tone="emerald" />
              <Metric value={metrics.consentNo} label="Said no" tone="slate" />
            </>
          ) : null}
        </section>

        <section className="mt-5">
          <div className="no-print mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-ink">
              Offline follow-up list ({followUp.length})
            </h2>
            {followUp.length > 0 ? <PrintButton label="Print list" /> : null}
          </div>

          {followUp.length === 0 ? (
            <p className="rounded-card border border-success-line bg-success-soft px-4 py-6 text-center text-sm font-semibold text-success">
              ✓ Every guardian has a digital delivery path for this notice.
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Guardian</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="no-print px-3 py-2">Handed over</th>
                  </tr>
                </thead>
                <tbody>
                  {followUp.map((row) => (
                    <tr
                      key={row.receiptKey}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-3 py-2 font-semibold text-ink">
                        {row.studentName}
                      </td>
                      <td className="px-3 py-2">{row.grade}</td>
                      <td className="px-3 py-2">
                        {row.guardianName}
                        <span className="block text-xs text-muted">
                          {relationshipLabel(row.relationshipType)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.phone || row.contactMethod}
                      </td>
                      <td className="no-print px-3 py-2">
                        <button
                          type="button"
                          onClick={() => markPaper(row)}
                          className="btn btn-secondary btn-sm flex items-center gap-1.5 font-semibold"
                        >
                          <FaCheck aria-hidden="true" className="h-3 w-3" />
                          Paper given
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="no-print mt-3 text-xs text-muted">
            Recording a paper hand-over does <strong>not</strong> mark the notice
            as read — it only records that the family received a copy.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}

function Metric({ value, label, tone = "slate" }) {
  const tones = {
    emerald: "bg-success-soft text-success",
    amber: "bg-warning-soft text-warning",
    sky: "bg-brand-soft text-brand-strong",
    slate: "bg-surface-2 text-ink",
  };
  return (
    <div className={`rounded-card px-3 py-3 ${tones[tone]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function relationshipLabel(value) {
  if (!value) return "Guardian";
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
