"use client";

import { useEffect, useState } from "react";
import { Send as FaPaperPlane, Star as FaStar } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import LoadingState from "@/components/ui/LoadingState";
import AppDate from "@/components/common/AppDate";

const TYPE_OPTIONS = [
  ["GENERAL", "General"],
  ["BUG", "Problem / Bug"],
  ["SUGGESTION", "Suggestion"],
  ["EXPERIENCE", "Experience"],
];

const initialForm = {
  type: "GENERAL",
  rating: "",
  title: "",
  message: "",
};

export default function FeedbackForm({ audience = "school" }) {
  const [form, setForm] = useState(initialForm);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadFeedback = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to load feedback");
      setFeedback(Array.isArray(payload.feedback) ? payload.feedback : []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFeedback();
  }, []);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rating: form.rating ? Number(form.rating) : null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Failed to submit feedback");

      setSuccess(payload.message || "Feedback submitted");
      setForm(initialForm);
      await loadFeedback();
    } catch (submitError) {
      setError(submitError.message || "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <AlertBanner type="error" title="Feedback failed" message={error} />}
      {success && (
        <AlertBanner type="success" title="Feedback sent" message={success} />
      )}

      <form
        onSubmit={submit}
        className="card p-3"
      >
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase text-brand-strong">
            Feedback
          </p>
          <h2 className="mt-2 font-semibold text-ink">
            Help improve Praavyo
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Share what is working, what is confusing, or what should be improved
            for {audience === "student" ? "students" : "schools"}.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_180px]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase text-muted">
              Feedback type
            </span>
            <select
              value={form.type}
              onChange={(event) => update("type", event.target.value)}
              className="input w-full"
            >
              {TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase text-muted">
              Rating
            </span>
            <select
              value={form.rating}
              onChange={(event) => update("rating", event.target.value)}
              className="input w-full"
            >
              <option value="">No rating</option>
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase text-muted">
            Title
          </span>
          <input
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Short feedback title"
            className="input w-full"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-semibold uppercase text-muted">
            Message
          </span>
          <textarea
            value={form.message}
            onChange={(event) => update("message", event.target.value)}
            placeholder="Write your feedback..."
            className="input w-full"
          />
        </label>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary inline-flex items-center justify-center gap-2 shadow-pop transition-colors"
            style={{ color: "#ffffff" }}
          >
            <FaPaperPlane style={{ color: "#ffffff" }} />
            <span style={{ color: "#ffffff" }}>
              {saving ? "Sending..." : "Send feedback"}
            </span>
          </button>
        </div>
      </form>

      <section className="card p-3">
        <h2 className="font-semibold text-ink">My Feedback</h2>
        {loading ? (
          <LoadingState
            title="Loading feedback"
            message="Preparing your previous feedback."
          />
        ) : feedback.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            No feedback sent yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {feedback.map((item) => (
              <article
                key={item.id}
                className="card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{item.title}</h3>
                  <span className="badge badge-brand text-xs">
                    {item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {item.message}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-muted">
                  <span>{item.type}</span>
                  {item.rating && (
                    <span className="inline-flex items-center gap-1">
                      <FaStar className="text-warning" />
                      {item.rating}
                    </span>
                  )}
                  <span><AppDate value={item.createdAt} mode="dateTime" /></span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
