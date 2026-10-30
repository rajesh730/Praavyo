"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight as FaArrowRight, FileText as FaFileAlt } from "lucide-react";
import { academicYearDisplayLabel } from "@pravyo/core/nepaliDate";

/**
 * The student's newest published result, on their dashboard. Opens the full
 * report card under My Result — the same card the school published and the
 * student's guardians see.
 */
export default function StudentResultCard() {
  const [state, setState] = useState({ reports: null, error: false });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cas-published", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((result) => setState({ reports: result.data || [], error: false }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ reports: [], error: true });
      });
    return () => controller.abort();
  }, []);

  const latest = state.reports?.[0];
  const snapshot = latest?.snapshot || {};

  return (
    <Link
      href={latest ? `/student/learning/cas/${latest._id}` : "/student/learning/cas"}
      className="card transition-colors hover:border-brand-line hover:bg-surface-2 flex items-center gap-4 p-5 transition-colors hover:border-brand"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control bg-brand-soft text-brand">
        <FaFileAlt aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-muted">My Result</span>
        <span className="block text-lg font-semibold text-ink">
          {state.reports === null
            ? "Checking for results…"
            : latest
              ? [
                  academicYearDisplayLabel(snapshot.academicYear?.label, {
                    yearStart: snapshot.academicYear?.yearStart,
                  }),
                  snapshot.student?.grade,
                ].filter(Boolean).join(" · ") || "Result published"
              : "No result published yet"}
        </span>
        {latest && snapshot.total?.achievement != null && (
          <span className="block text-sm text-muted">
            Achievement {snapshot.total.achievement}% · open your report card
          </span>
        )}
      </span>
      <FaArrowRight className="shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}
