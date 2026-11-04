"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Music } from "lucide-react";
import AppDate from "@/components/common/AppDate";
import ProgramCountdown from "./ProgramCountdown";

/**
 * Overview strip: the next performance programs with a live countdown.
 * Renders nothing when there is nothing coming up.
 */
export default function UpcomingPrograms({ manageHref, className = "" }) {
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    fetch("/api/programs?upcoming=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => setPrograms(payload?.data?.programs || []))
      .catch(() => setPrograms([]));
  }, []);

  if (programs.length === 0) return null;

  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          <Music aria-hidden size={18} className="text-brand" /> Upcoming programs
        </h3>
        {manageHref && (
          <Link href={manageHref} className="text-sm font-semibold text-brand hover:underline">Open</Link>
        )}
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {programs.slice(0, 3).map((program) => (
          <li key={program._id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{program.title}</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <CalendarDays aria-hidden size={12} />
                <AppDate value={program.date} mode="dateTime" />
                {" · "}
                {program.performances.length} performance{program.performances.length === 1 ? "" : "s"}, {program.performerCount} student{program.performerCount === 1 ? "" : "s"}
              </span>
            </span>
            <ProgramCountdown date={program.date} />
          </li>
        ))}
      </ul>
    </section>
  );
}
