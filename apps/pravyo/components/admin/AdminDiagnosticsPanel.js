"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell as FaBell, RadioTower as FaBroadcastTower, CircleCheck as FaCheckCircle, TriangleAlert as FaExclamationTriangle, HeartPulse as FaHeartbeat, RotateCw as FaRedoAlt, SatelliteDish as FaSatelliteDish } from "lucide-react";
import useRealtimeChannel from "@/lib/client/useRealtimeChannel";
import useCalendarPreference from "@/lib/client/useCalendarPreference";
import { formatDateTime as formatCalendarDateTime } from "@/lib/nepaliDate";
import AppDate from "@/components/common/AppDate";

const DIAGNOSTIC_CHANNELS = [
  {
    id: "admin-diagnostics",
    label: "Admin diagnostics",
    description: "Safe control channel used by this page.",
  },
  {
    id: "public-feed",
    label: "Public feed",
    description: "Verifies public feed realtime delivery.",
  },
  {
    id: "student-notifications",
    label: "Student notifications",
    description: "Verifies student notice channel delivery.",
  },
  {
    id: "school-notifications",
    label: "School notifications",
    description: "Verifies school notice channel delivery.",
  },
];

const formatDateTime = (value, calendar) =>
  value ? formatCalendarDateTime(value, calendar) : "Not available";

function StatCard({ icon: Icon, label, value, tone = "blue" }) {
  const toneClasses = {
    blue: "border-brand-line bg-brand-soft text-brand-strong",
    emerald: "border-success-line bg-success-soft text-success",
    amber: "border-warning-line bg-warning-soft text-warning",
  };

  return (
    <div className={`card p-4 ${toneClasses[tone] || toneClasses.blue}`}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-surface">
          <Icon />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ label, ok, detail }) {
  return (
    <div className="card flex items-start justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-1 text-sm text-muted">{detail}</p>
      </div>
      <span
        className={`badge badge-neutral inline-flex items-center gap-2 text-xs uppercase tracking-wide ${
          ok
            ? "border border-success-line bg-success-soft text-success"
            : "border border-warning-line bg-warning-soft text-warning"
        }`}
      >
        {ok ? <FaCheckCircle /> : <FaExclamationTriangle />}
        {ok ? "OK" : "Attention"}
      </span>
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div className="card flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}

function ChannelPingRow({ channel, lastPing, pending, onPing }) {
  return (
    <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold text-ink">{channel.label}</p>
        <p className="mt-1 text-sm text-muted">{channel.description}</p>
        <p className="mt-2 text-xs text-muted">
          Last received:{" "}
          <span className="font-semibold text-ink">
            {lastPing ? <AppDate value={lastPing.timestamp} mode="dateTime" /> : "Not yet"}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onPing(channel.id)}
        disabled={pending}
        className="btn btn-secondary inline-flex items-center justify-center gap-2 font-semibold transition-colors"
      >
        <FaSatelliteDish />
        {pending ? "Sending..." : "Ping"}
      </button>
    </div>
  );
}

export default function AdminDiagnosticsPanel() {
  const { calendar } = useCalendarPreference();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [channelPings, setChannelPings] = useState({});
  const [pendingChannel, setPendingChannel] = useState("");
  const [eventChannelId, setEventChannelId] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/diagnostics", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load diagnostics");
      }
      setSummary(data);
    } catch (loadError) {
      setError(loadError.message || "Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const realtimeChannels = useMemo(
    () => [
      ...DIAGNOSTIC_CHANNELS.map((channel) => channel.id),
      ...(eventChannelId ? [`event-${eventChannelId}-notices`] : []),
    ],
    [eventChannelId]
  );

  useRealtimeChannel(
    realtimeChannels,
    useCallback((data) => {
      setStreamConnected(true);
      if (data.payload?.kind !== "diagnostic-ping") return;
      setLastPing(data);
      setChannelPings((current) => ({
        ...current,
        [data.channel]: data,
      }));
    }, []),
    {
      onStatusChange: ({ status }) => {
        setStreamConnected(status === "connected");
      },
    }
  );

  const sendPing = useCallback(async (channel = "admin-diagnostics") => {
    try {
      setPendingChannel(channel);
      const res = await fetch("/api/admin/diagnostics/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "event-notices"
            ? { channel, eventId: eventChannelId }
            : { channel }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to send realtime ping");
      }
    } catch (pingError) {
      setError(pingError.message || "Failed to send realtime ping");
    } finally {
      setPendingChannel("");
    }
  }, [eventChannelId]);

  const checks = useMemo(() => {
    if (!summary) return [];

    return [
      {
        label: "Database connection",
        ok: Boolean(summary.database?.connected),
        detail: "Diagnostics summary loaded from MongoDB-backed APIs.",
      },
      {
        label: "Realtime stream",
        ok: streamConnected,
        detail: streamConnected
          ? "Admin diagnostics stream is connected."
          : "Open stream did not confirm connection yet.",
      },
      {
        label: "Realtime provider",
        ok: true,
        detail: `Current provider: ${summary.realtime?.provider || "unknown"}.`,
      },
      {
        label: "Realtime publish health",
        ok: !summary.realtime?.lastErrors?.redisPublish,
        detail: summary.realtime?.lastErrors?.redisPublish
          ? `Last publish failure: ${summary.realtime.lastErrors.redisPublish.message}`
          : "No Redis publish failures recorded for this server instance.",
      },
      {
        label: "Realtime poll health",
        ok: !summary.realtime?.lastErrors?.redisPoll,
        detail: summary.realtime?.lastErrors?.redisPoll
          ? `Last poll failure: ${summary.realtime.lastErrors.redisPoll.message}`
          : "No Redis polling failures recorded for this server instance.",
      },
      {
        label: "Round-trip ping",
        ok: Boolean(lastPing),
        detail: lastPing
          ? `Last ping received at ${formatDateTime(lastPing.timestamp, calendar)}.`
          : "No diagnostics ping received yet in this session.",
      },
    ];
  }, [calendar, lastPing, streamConnected, summary]);

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Internal QA
            </p>
            <h1 className="mt-2 font-semibold text-ink">
              Platform Diagnostics
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Verify realtime delivery, notices, and core public counters without
              jumping across multiple accounts and screens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadSummary()}
              className="btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors"
            >
              <FaRedoAlt />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void sendPing("admin-diagnostics")}
              disabled={Boolean(pendingChannel)}
              className="btn btn-primary inline-flex items-center gap-2 font-semibold transition-colors"
            >
              <FaSatelliteDish />
              {pendingChannel === "admin-diagnostics"
                ? "Sending..."
                : "Send Realtime Ping"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-card border border-danger-line bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="card h-28 animate-pulse"
            />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard
              icon={FaBell}
              label="Platform Notices"
              value={summary.notifications?.platformNoticeCount ?? 0}
            />
            <StatCard
              icon={FaBroadcastTower}
              label="Event Notices"
              value={summary.notifications?.eventNoticeCount ?? 0}
              tone="emerald"
            />
            <StatCard
              icon={FaHeartbeat}
              label="Public Events"
              value={summary.publicEvents?.publicEventCount ?? 0}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="card space-y-4 p-4 sm:p-5">
              <h2 className="font-semibold text-ink">Checks</h2>
              {checks.map((check) => (
                <CheckRow
                  key={check.label}
                  label={check.label}
                  ok={check.ok}
                  detail={check.detail}
                />
              ))}
            </div>

            <div className="card space-y-4 p-4 sm:p-5">
              <h2 className="font-semibold text-ink">Summary</h2>
              <div className="card p-4 text-sm text-muted">
                <p>
                  Diagnostics generated:{" "}
                  <span className="font-semibold text-ink">
                    <AppDate value={summary.generatedAt} mode="dateTime" fallback="Not available" />
                  </span>
                </p>
                <p className="mt-2">
                  Realtime backend:{" "}
                  <span className="font-semibold text-ink">
                    {summary.realtime?.provider || "unknown"}
                  </span>
                </p>
                <p className="mt-2">
                  Redis configured:{" "}
                  <span className="font-semibold text-ink">
                    {summary.realtime?.redisConfigured ? "Yes" : "No"}
                  </span>
                </p>
                <p className="mt-2">
                  Realtime instance:{" "}
                  <span className="font-semibold text-ink">
                    {summary.realtime?.instanceId || "unknown"}
                  </span>
                </p>
                <p className="mt-2">
                  Student-targeted notices:{" "}
                  <span className="font-semibold text-ink">
                    {summary.notifications?.studentNoticeCount ?? 0}
                  </span>
                </p>
              </div>

              <div className="card p-4 text-sm text-muted">
                <p className="font-semibold text-ink">Realtime QA note</p>
                <p className="mt-2 leading-6">
                  Use the ping buttons to verify each channel can receive a published
                  realtime event on demand. Diagnostic payloads use a safe kind and do
                  not create notices or user-facing records.
                </p>
              </div>

              <div className="card p-4">
                <p className="text-sm font-semibold text-ink">
                  Realtime Counters
                </p>
                <div className="mt-3 grid gap-2">
                  <MetricRow
                    label="Local publishes"
                    value={summary.realtime?.counters?.localPublished ?? 0}
                  />
                  <MetricRow
                    label="Redis publish attempts"
                    value={
                      summary.realtime?.counters?.redisPublishAttempts ?? 0
                    }
                  />
                  <MetricRow
                    label="Redis publish failures"
                    value={
                      summary.realtime?.counters?.redisPublishFailures ?? 0
                    }
                  />
                  <MetricRow
                    label="Redis poll attempts"
                    value={summary.realtime?.counters?.redisPollAttempts ?? 0}
                  />
                  <MetricRow
                    label="Redis poll failures"
                    value={summary.realtime?.counters?.redisPollFailures ?? 0}
                  />
                  <MetricRow
                    label="Redis events received"
                    value={summary.realtime?.counters?.redisEventsReceived ?? 0}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-4 sm:p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-semibold text-ink">
                  Channel Pings
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Send diagnostic-only events through each realtime channel.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={eventChannelId}
                  onChange={(event) => setEventChannelId(event.target.value)}
                  placeholder="Event ID"
                  className="input transition-colors"
                />
                <button
                  type="button"
                  onClick={() => void sendPing("event-notices")}
                  disabled={!eventChannelId.trim() || Boolean(pendingChannel)}
                  className="btn btn-primary inline-flex items-center justify-center gap-2 font-semibold transition-colors"
                >
                  <FaSatelliteDish />
                  {pendingChannel === "event-notices"
                    ? "Sending..."
                    : "Ping Event"}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {DIAGNOSTIC_CHANNELS.map((channel) => (
                <ChannelPingRow
                  key={channel.id}
                  channel={channel}
                  lastPing={channelPings[channel.id]}
                  pending={pendingChannel === channel.id}
                  onPing={sendPing}
                />
              ))}
              {eventChannelId.trim() && (
                <ChannelPingRow
                  channel={{
                    id: "event-notices",
                    label: "Event notices",
                    description: `Verifies event-${eventChannelId.trim()}-notices delivery.`,
                  }}
                  lastPing={
                    channelPings[`event-${eventChannelId.trim()}-notices`]
                  }
                  pending={pendingChannel === "event-notices"}
                  onPing={sendPing}
                />
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
