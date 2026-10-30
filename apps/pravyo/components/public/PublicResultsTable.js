"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink as FaExternalLinkAlt, School as FaSchool, Search as FaSearch, Trophy as FaTrophy } from "lucide-react";
import { formatPlacement } from "@/lib/displayFormat";

function placementTone(value) {
  const placement = String(value || "").toUpperCase();
  if (placement === "WINNER") return "bg-warning-soft text-warning";
  if (placement === "RUNNER_UP") return "bg-brand-soft text-brand-strong";
  if (placement === "THIRD_PLACE") return "bg-warning-soft text-warning";
  if (placement === "PARTICIPANT") return "bg-success-soft text-success";
  if (placement === "FINALIST") return "bg-brand-soft text-brand-strong";
  return "bg-surface-2 text-ink";
}

export default function PublicResultsTable({ achievements = [], resultsPublished }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [placementFilter, setPlacementFilter] = useState("all");

  const placementOptions = useMemo(() => {
    const placements = new Set();
    achievements.forEach((achievement) => {
      if (achievement.placement) placements.add(String(achievement.placement));
    });
    return Array.from(placements);
  }, [achievements]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return achievements.filter((achievement) => {
      if (placementFilter !== "all" && achievement.placement !== placementFilter) {
        return false;
      }
      if (!term) return true;
      const name = (achievement.studentName || "").toLowerCase();
      const school = (achievement.schoolName || "").toLowerCase();
      return name.includes(term) || school.includes(term);
    });
  }, [achievements, searchTerm, placementFilter]);

  const hasResults = resultsPublished && achievements.length > 0;

  return (
    <section id="results" className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink">
          <FaTrophy className="text-warning" />
          Results
        </h2>
        {hasResults && (
          <span className="badge badge-neutral text-xs">
            {filtered.length} of {achievements.length}
          </span>
        )}
      </div>

      {!resultsPublished ? (
        <p className="mt-4 rounded-control bg-surface-2 p-4 text-sm font-semibold text-muted">
          Results are not published yet.
        </p>
      ) : achievements.length === 0 ? (
        <p className="mt-4 rounded-control bg-surface-2 p-4 text-sm font-semibold text-muted">
          No public result records are available yet.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by student or school name..."
                className="input w-full pl-9 pr-3"
              />
            </div>
            {placementOptions.length > 1 && (
              <select
                value={placementFilter}
                onChange={(e) => setPlacementFilter(e.target.value)}
                className="input sm:w-48"
              >
                <option value="all">All placements</option>
                {placementOptions.map((placement) => (
                  <option key={placement} value={placement}>
                    {formatPlacement(placement)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="mt-4 rounded-control bg-surface-2 p-4 text-sm font-semibold text-muted">
              No results match your search.
            </p>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="card hidden sm:block mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Student</th>
                      <th className="px-4 py-2.5 font-semibold">School</th>
                      <th className="px-4 py-2.5 font-semibold">Placement</th>
                      <th className="px-4 py-2.5 font-semibold">Certificate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-line">
                    {filtered.map((achievement) => (
                      <tr key={achievement._id}>
                        <td className="px-4 py-2.5 font-semibold text-ink">
                          {achievement.studentName}
                        </td>
                        <td className="px-4 py-2.5">
                          {achievement.schoolId ? (
                            <Link
                              href={`/schools/${achievement.schoolId}`}
                              className="font-semibold text-brand-strong hover:text-brand-strong"
                            >
                              {achievement.schoolName || "School"}
                            </Link>
                          ) : (
                            <span className="text-muted">School</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`badge badge-neutral ${placementTone(
                              achievement.placement
                            )}`}
                          >
                            {formatPlacement(achievement.placement)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {achievement.certificateUrl ? (
                            <a
                              href={achievement.certificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-strong"
                            >
                              View certificate
                              <FaExternalLinkAlt />
                            </a>
                          ) : (
                            <span className="text-subtle">Not public</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card-based View */}
              <div className="block sm:hidden mt-4 space-y-3">
                {filtered.map((achievement) => (
                  <div
                    key={achievement._id}
                    className="card p-4 flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink text-sm truncate">
                        {achievement.studentName}
                      </span>
                      <span
                        className={`badge badge-neutral shrink-0 uppercase ${placementTone(
                          achievement.placement
                        )}`}
                      >
                        {formatPlacement(achievement.placement)}
                      </span>
                    </div>
                    <div className="text-xs text-muted flex items-center gap-1.5">
                      <FaSchool className="text-brand-strong shrink-0" />
                      {achievement.schoolId ? (
                        <Link
                          href={`/schools/${achievement.schoolId}`}
                          className="font-semibold text-brand-strong hover:text-brand-strong truncate"
                        >
                          {achievement.schoolName || "School"}
                        </Link>
                      ) : (
                        <span className="truncate">School</span>
                      )}
                    </div>
                    {achievement.certificateUrl && (
                      <div className="mt-1.5 pt-2 border-t border-line flex justify-end">
                        <a
                          href={achievement.certificateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-strong"
                        >
                          View certificate
                          <FaExternalLinkAlt className="text-2xs" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
