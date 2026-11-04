"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, MapPin, Music } from "lucide-react";
import AppDate from "@/components/common/AppDate";
import ProgramCountdown from "./ProgramCountdown";

const MY_STATUS = {
  REGISTERED: { label: "You are in", tone: "badge-brand" },
  PERFORMED: { label: "Performed", tone: "badge-success" },
  NOT_PERFORMED: { label: "Did not perform", tone: "badge-neutral" },
};

/**
 * The student's school programs: join or leave a performance while the list
 * is open, see the countdown, and open certificates once the school publishes.
 */
export default function StudentPrograms() {
  const [programs, setPrograms] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/student/programs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => live && payload && setPrograms(payload.data?.programs || []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [reloadKey]);

  const act = async (programId, performanceId, action) => {
    setBusy(performanceId);
    setError("");
    try {
      const res = await fetch("/api/student/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId, performanceId, action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Please try again.");
      setReloadKey((key) => key + 1);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy("");
    }
  };

  if (programs.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <Music aria-hidden size={18} className="text-brand" /> School programs
      </h2>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {programs.map((program) => (
        <article key={program._id} className="card overflow-hidden">
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ProgramCountdown date={program.date} />
              {program.stage === "LOCKED" && <span className="badge badge-warning text-xs">List closed</span>}
            </div>
            <h3 className="mt-2 text-base font-semibold text-ink">{program.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden size={14} /><AppDate value={program.date} mode="dateTime" /></span>
              {program.venue && <span className="inline-flex items-center gap-1"><MapPin aria-hidden size={14} />{program.venue}</span>}
            </p>
            {program.description && <p className="mt-2 whitespace-pre-line text-sm text-ink">{program.description}</p>}
          </div>
          {program.performances.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {program.performances.map((performance) => (
                <li key={performance._id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{performance.title}</span>
                    <span className="block text-xs text-muted">
                      {performance.performanceType === "GROUP" ? "Group" : "Solo"} · {performance.performerCount} student{performance.performerCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  {performance.joined && MY_STATUS[performance.myStatus] && (
                    <span className={`badge ${MY_STATUS[performance.myStatus].tone} text-xs`}>{MY_STATUS[performance.myStatus].label}</span>
                  )}
                  {performance.certificateUrl && (
                    <Link href={performance.certificateUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm inline-flex items-center gap-1">
                      <BadgeCheck aria-hidden size={14} /> Certificate
                    </Link>
                  )}
                  {program.stage !== "PUBLISHED" && !performance.locked && (
                    performance.joined ? (
                      <button type="button" disabled={busy === performance._id} className="btn btn-ghost btn-sm" onClick={() => act(program._id, performance._id, "leave")}>
                        Leave
                      </button>
                    ) : (
                      <button type="button" disabled={busy === performance._id} className="btn btn-soft btn-sm" onClick={() => act(program._id, performance._id, "join")}>
                        Join
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}
