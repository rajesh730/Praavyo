"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useParentApp,
  useParentFetch,
} from "@/components/parent/ParentAppContext";
import StatusCard from "@/components/parent/StatusCard";
import ParentEmptyState from "@/components/parent/ParentEmptyState";
import { formatParentDate } from "@/lib/parentFormat";
import Glyph from "@/components/ui/Glyph";

/**
 * The Events tab (§12): LIVE NOW · OPEN FOR REGISTRATION · REGISTERED · COMPLETED.
 *
 * Every registration control names the child explicitly ("Register Aayush").
 * With two children in the app, an unlabelled "Register" button is the single
 * easiest way for a parent to sign up the wrong child, and the error is only
 * discovered on the day.
 */
export default function ParentEventsPage() {
  const { t, selectedChildId, selectedChild, preferences } = useParentApp();
  const parentFetch = useParentFetch();

  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [busyEventId, setBusyEventId] = useState(null);

  const load = useCallback(async () => {
    if (!selectedChildId) return;
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));
      const data = await parentFetch("/api/parent/events");
      setState({ loading: false, error: "", data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [parentFetch, selectedChildId]);

  useEffect(() => {
    load();
  }, [load]);

  const register = async (eventId) => {
    setBusyEventId(eventId);
    try {
      const res = await fetch(`/api/parent/events/${eventId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedChildId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to register");
      await load();
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message }));
    } finally {
      setBusyEventId(null);
    }
  };

  if (!selectedChildId) return null;

  if (state.loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-card bg-surface-2" />
        ))}
      </div>
    );
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
            onClick={load}
            className="btn btn-primary"
          >
            {t("common.retry")}
          </button>
        }
      />
    );
  }

  const { sections } = state.data;
  const calendar = preferences.calendarPreference;
  const childName = selectedChild?.name || "";

  const isEmpty =
    sections.live.length === 0 &&
    sections.openForRegistration.length === 0 &&
    sections.registered.length === 0 &&
    sections.completed.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="font-semibold text-ink">
        {t("events.title")}
      </h1>

      {state.error ? (
        <p className="rounded-card bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      {isEmpty ? (
        <ParentEmptyState emoji="📅" title={t("events.empty")} tone="neutral" />
      ) : null}

      {/* --- LIVE NOW ---------------------------------------------------- */}
      <Section title={t("events.liveNow")} emoji="🔴" items={sections.live}>
        {(event) => (
          <StatusCard
            key={event.id}
            status="ACTION_REQUIRED"
            emoji="🎪"
            eyebrow={t("events.liveNow")}
            title={event.title}
            body={t("home.participating", { name: childName })}
            meta={formatParentDate(event.date, { calendar })}
            href={`/parent/events?event=${event.id}`}
            cta={t("home.viewEvent")}
            live
          />
        )}
      </Section>

      {/* --- OPEN FOR REGISTRATION --------------------------------------- */}
      <Section
        title={t("events.openForRegistration")}
        emoji="🟡"
        items={sections.openForRegistration}
      >
        {(event) => (
          <StatusCard
            key={event.id}
            status={event.status}
            emoji="🗓️"
            title={event.title}
            body={event.description}
            meta={
              event.registrationDeadline
                ? t("events.registrationCloses", {
                    date: formatParentDate(event.registrationDeadline, {
                      calendar,
                      relative: false,
                    }),
                  })
                : formatParentDate(event.date, { calendar })
            }
            // Hidden entirely for a guardian without registration rights (§20).
            cta={
              event.canRegister
                ? busyEventId === event.id
                  ? t("common.loading")
                  : t("events.registerChild", { name: childName })
                : null
            }
            onAction={() => register(event.id)}
          />
        )}
      </Section>

      {/* --- REGISTERED --------------------------------------------------- */}
      <Section title={t("events.registered")} emoji="🟢" items={sections.registered}>
        {(event) => (
          <StatusCard
            key={event.id}
            status={event.status}
            emoji="✅"
            eyebrow={
              event.awaitingApproval
                ? t("events.awaitingApproval")
                : t("events.registered")
            }
            title={event.title}
            body={t("events.alreadyRegistered", { name: childName })}
            meta={formatParentDate(event.date, { calendar, relative: false })}
          />
        )}
      </Section>

      {/* --- COMPLETED ---------------------------------------------------- */}
      <Section title={t("events.completed")} emoji="🏁" items={sections.completed}>
        {(event) => (
          <StatusCard
            key={event.id}
            status="COMPLETE"
            emoji={event.result ? "🏆" : "🎯"}
            eyebrow={t("events.completed")}
            title={event.title}
            body={event.result ? event.result.placement : ""}
            meta={formatParentDate(event.date, { calendar, relative: false })}
            // The Event → Result → Certificate chain, closed on one card (§12).
            href={event.certificate?.verifyPath || undefined}
            cta={event.certificate ? t("events.viewCertificate") : null}
          />
        )}
      </Section>
    </div>
  );
}

function Section({ title, emoji, items, children }) {
  if (!items || items.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wide text-muted">
        <Glyph emoji={emoji} />
        {title}
        <span className="badge badge-neutral text-xs">
          {items.length}
        </span>
      </h2>
      <div className="space-y-3">{items.map((item) => children(item))}</div>
    </section>
  );
}
