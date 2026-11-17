"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft as FaArrowLeft, CircleCheck as FaCheckCircle, Circle as FaRegCircle } from "lucide-react";
import {
  useParentApp,
  useParentFetch,
} from "@/components/parent/ParentAppContext";
import ParentEmptyState from "@/components/parent/ParentEmptyState";
import { getStatus } from "@/lib/parentStatus";
import { formatParentDate } from "@/lib/parentFormat";
import DateTile from "@/components/common/DateTile";

/**
 * Notice detail (§11).
 *
 * Opening this page is what creates the read receipt — the GET request itself
 * records `openedAt` server-side, after the notice has been confirmed
 * deliverable to this child. Nothing here posts a "mark read" call, because
 * read state must reflect the parent actually reaching the content.
 *
 * Also renders the two action types the spec defines:
 *   - "✓ I Understand" for acknowledgement notices
 *   - "Allow {name} to participate?  YES / NO" for permission notices
 */
export default function ParentNoticeDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t, selectedChildId, selectedChild, preferences, refreshBadges } =
    useParentApp();
  const parentFetch = useParentFetch();

  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!selectedChildId || !id) return;
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const data = await parentFetch(`/api/parent/notices/${id}`);
      setState({ loading: false, error: "", data });
      // The open just happened — the unread badge is now stale.
      refreshBadges();
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [parentFetch, id, selectedChildId, refreshBadges]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (payload) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/parent/notices/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, studentId: selectedChildId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed");
      await load();
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) {
    return <div className="h-64 animate-pulse rounded-card bg-surface-2" />;
  }

  if (state.error && !state.data) {
    return (
      <ParentEmptyState
        emoji="⚠️"
        tone="neutral"
        title={t("common.somethingWrong")}
        action={
          <button
            type="button"
            onClick={() => router.push("/parent/notices")}
            className="btn btn-primary"
          >
            {t("common.back")}
          </button>
        }
      />
    );
  }

  const { notice, guardians, canGiveConsent } = state.data;
  const descriptor = getStatus(notice.status);
  const receipt = notice.receipt || {};
  const calendar = preferences.calendarPreference;

  return (
    <article className="space-y-4">
      <button
        type="button"
        onClick={() => router.push("/parent/notices")}
        className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-muted"
      >
        <FaArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
        {t("notices.title")}
      </button>

      <header className={`card p-4 ${descriptor.classes.card}`}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white ${descriptor.classes.dot}`}
          >
            {descriptor.icon}
          </span>
          <span
            className={`text-xs font-semibold uppercase tracking-wide ${descriptor.classes.accent}`}
          >
            {t(descriptor.labelKey)}
          </span>
        </div>

        <div className="mt-3 flex items-start gap-3.5">
          {notice.publishedAt && <DateTile value={notice.publishedAt} calendar={calendar} size="lg" />}
          <div className="min-w-0">
            <h1 className="break-words font-semibold leading-snug text-ink">
              {notice.title}
            </h1>
            <p className="mt-1 text-xs text-muted">
              {formatParentDate(notice.publishedAt, { calendar, relative: false })}
            </p>
          </div>
        </div>
      </header>

      <div className="whitespace-pre-wrap break-words text-base leading-relaxed text-ink">
        {notice.content}
      </div>

      {notice.attachments?.length > 0 ? (
        <ul className="space-y-2">
          {notice.attachments.map((attachment, index) => (
            <li key={index}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary flex items-center gap-2 font-semibold"
              >
                📎 {attachment.name || "Attachment"}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {/* --- Acknowledgement --------------------------------------------- */}
      {notice.requiresAcknowledgement ? (
        receipt.acknowledgedAt ? (
          <p className="flex items-center gap-2 rounded-card bg-success-soft px-4 py-3 text-sm font-semibold text-success">
            <FaCheckCircle aria-hidden="true" className="h-4 w-4" />
            {t("notices.acknowledged", {
              date: formatParentDate(receipt.acknowledgedAt, { calendar }),
            })}
          </p>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => respond({ action: "ACKNOWLEDGE" })}
            className="btn btn-primary w-full"
          >
            ✓ {t("notices.iUnderstand")}
          </button>
        )
      ) : null}

      {/* --- Consent ------------------------------------------------------ */}
      {notice.requiresConsent ? (
        <section className="rounded-card border border-warning-line bg-warning-soft p-4">
          <p className="text-base font-semibold text-ink">
            {t("notices.consentQuestion", { name: selectedChild?.name || "" })}
          </p>

          {receipt.consentDecision === "YES" ||
          receipt.consentDecision === "NO" ? (
            <p className="mt-3 rounded-card bg-surface px-4 py-3 text-sm font-semibold text-ink">
              {t("notices.consentRecorded", {
                answer:
                  receipt.consentDecision === "YES"
                    ? t("notices.yes")
                    : t("notices.no"),
                date: formatParentDate(receipt.consentDecidedAt, { calendar }),
              })}
            </p>
          ) : canGiveConsent ? (
            <div className="mt-4 grid grid-cols-1 gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => respond({ action: "CONSENT", decision: "YES" })}
                className="btn btn-primary"
              >
                {t("notices.yes")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => respond({ action: "CONSENT", decision: "NO" })}
                className="btn btn-secondary"
              >
                {t("notices.no")}
              </button>
            </div>
          ) : (
            // A guardian without consent rights sees the question and the
            // outcome, but no buttons — the school decides who may answer (§20).
            <p className="mt-3 text-sm text-muted">
              Only a guardian approved by the school can answer this.
            </p>
          )}
        </section>
      ) : null}

      {/* --- Per-guardian read state (§11) -------------------------------- */}
      {guardians?.length > 1 ? (
        <section className="card p-4">
          <h2 className="mb-3 font-semibold uppercase tracking-wide text-muted">
            {t("notices.otherGuardians")}
          </h2>
          <ul className="space-y-2">
            {guardians.map((guardian, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium text-ink">
                  {relationshipLabel(guardian.relationshipType)}
                </span>
                {guardian.openedAt ? (
                  <span className="flex items-center gap-1.5 text-success">
                    <FaCheckCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("notices.read")}{" "}
                    {formatParentDate(guardian.openedAt, { calendar })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-muted">
                    <FaRegCircle aria-hidden="true" className="h-3.5 w-3.5" />
                    {t("notices.notReadYet")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
function relationshipLabel(value) {
  return String(value || "Guardian")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
