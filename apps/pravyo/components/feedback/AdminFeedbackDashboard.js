"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRememberedState } from "@pravyo/ui/rememberedState";
import { CircleCheck as FaCheckCircle, ListFilter as FaFilter, Star as FaStar } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import AppDate from "@/components/common/AppDate";

export default function AdminFeedbackDashboard() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useRememberedState("admin-feedback:status", "ALL");
  const [role, setRole] = useState("ALL");
  const [error, setError] = useState("");

  const loadFeedback = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (role !== "ALL") params.set("role", role);
      const res = await fetch(`/api/feedback?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to load feedback");
      setFeedback(Array.isArray(payload.feedback) ? payload.feedback : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [role, status]);

  useEffect(() => {
    void loadFeedback();
  }, [loadFeedback]);

  const counts = useMemo(
    () => ({
      total: feedback.length,
      newCount: feedback.filter((item) => item.status === "NEW").length,
    }),
    [feedback]
  );

  const updateStatus = async (item, nextStatus) => {
    try {
      setBusyId(item.id);
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to update feedback");
      await loadFeedback();
    } catch (updateError) {
      setError(updateError.message || "Failed to update feedback");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="card p-3">
        <p className="text-xs font-semibold uppercase text-brand-strong">
          Platform Feedback
        </p>
        <h1 className="mt-2 font-semibold text-ink">
          Feedback Inbox
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Review feedback submitted by schools and students.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <span className="rounded-control bg-surface-2 px-4 py-2 text-sm font-semibold text-brand-strong">
            {counts.total} total
          </span>
          <span className="rounded-control bg-warning-soft px-4 py-2 text-sm font-semibold text-warning">
            {counts.newCount} new
          </span>
        </div>
      </section>

      {error && <AlertBanner type="error" title="Feedback failed" message={error} />}

      <section className="card p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label>
            <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase text-muted">
              <FaFilter className="text-brand-strong" />
              Status
            </span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="input w-full"
            >
              {["ALL", "NEW", "REVIEWED", "ARCHIVED"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-semibold uppercase text-muted">
              Sender
            </span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="input w-full"
            >
              <option value="ALL">All senders</option>
              <option value="SCHOOL_ADMIN">Schools</option>
              <option value="STUDENT">Students</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setStatus("ALL");
              setRole("ALL");
            }}
            className="btn btn-secondary"
          >
            Clear
          </button>
        </div>
      </section>

      {loading ? (
        <LoadingState title="Loading feedback" message="Preparing feedback inbox." />
      ) : feedback.length === 0 ? (
        <section className="card p-6 text-center text-sm font-semibold text-muted">
          No feedback in this view.
        </section>
      ) : (
        <div className="space-y-3">
          {feedback.map((item) => (
            <article
              key={item.id}
              className="card p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-neutral text-xs">
                      {item.submitterRole === "STUDENT" ? "Student" : "School"}
                    </span>
                    <span className="badge badge-neutral text-xs">
                      {item.type}
                    </span>
                    <span className="badge badge-success text-xs">
                      {item.status}
                    </span>
                  </div>
                  <h2 className="mt-3 font-semibold text-ink">
                    {item.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {item.message}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-muted">
                    <span>{item.submitterName || "Unknown sender"}</span>
                    {item.schoolName && <span>{item.schoolName}</span>}
                    {item.rating && (
                      <span className="inline-flex items-center gap-1">
                        <FaStar className="text-warning" />
                        {item.rating}
                      </span>
                    )}
                    <span><AppDate value={item.createdAt} mode="dateTime" /></span>
                  </div>
                </div>
                {item.status === "NEW" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => updateStatus(item, "REVIEWED")}
                    className="btn btn-primary inline-flex items-center justify-center gap-2"
                    style={{ color: "#ffffff" }}
                  >
                    <FaCheckCircle style={{ color: "#ffffff" }} />
                    <span style={{ color: "#ffffff" }}>Mark reviewed</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
