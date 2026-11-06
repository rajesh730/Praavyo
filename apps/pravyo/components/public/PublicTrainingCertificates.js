"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, Search, X } from "lucide-react";

const byGrade = (a, b) => a.localeCompare(b, undefined, { numeric: true });

/** Every certificate of a public training, filterable by name, school and grade. */
export default function PublicTrainingCertificates({ certificates = [] }) {
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState("");
  const [grade, setGrade] = useState("");

  const schools = useMemo(
    () => [...new Map(certificates.map((row) => [row.schoolId, row.schoolName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [certificates]
  );
  const grades = useMemo(() => [...new Set(certificates.map((row) => row.grade).filter(Boolean))].sort(byGrade), [certificates]);
  const term = query.trim().toLowerCase();
  const shown = certificates.filter(
    (row) =>
      (!school || row.schoolId === school) &&
      (!grade || row.grade === grade) &&
      (!term || `${row.name} ${row.schoolName} ${row.code}`.toLowerCase().includes(term))
  );
  const filtering = Boolean(term || school || grade);

  return (
    <section id="certificates" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink">
          <BadgeCheck className="text-success" aria-hidden /> Certificates
        </h2>
        <span className="badge badge-neutral tabular-nums">{filtering ? `${shown.length} of ${certificates.length}` : certificates.length}</span>
      </div>

      {certificates.length === 0 ? (
        <p className="m-4 rounded-control bg-surface-2 p-4 text-sm font-semibold text-muted">
          No certificates yet. They appear here as Praavyo completes the training at each school.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 border-b border-line bg-surface-2 p-3 md:flex-row">
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, school or certificate code" className="input w-full bg-surface pl-9" aria-label="Search certificates" />
            </label>
            {schools.length > 1 && (
              <select value={school} onChange={(event) => setSchool(event.target.value)} className="input bg-surface md:w-60" aria-label="School">
                <option value="">All schools</option>
                {schools.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            )}
            {grades.length > 1 && (
              <select value={grade} onChange={(event) => setGrade(event.target.value)} className="input bg-surface md:w-40" aria-label="Grade">
                <option value="">All grades</option>
                {grades.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            )}
            {filtering && (
              <button type="button" onClick={() => { setQuery(""); setSchool(""); setGrade(""); }} className="btn btn-ghost btn-sm self-center"><X aria-hidden /> Clear</button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No certificate matches.</p>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Name</th>
                    <th className="hidden text-left sm:table-cell">School</th>
                    <th className="text-left">Grade</th>
                    <th className="text-right">Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="font-semibold text-ink">{row.name}</span>
                        <span className="block text-xs text-muted sm:hidden">{row.schoolName}</span>
                      </td>
                      <td className="hidden sm:table-cell">
                        {row.schoolId ? <Link href={`/schools/${row.schoolId}`} className="text-brand-strong hover:underline">{row.schoolName}</Link> : row.schoolName}
                      </td>
                      <td className="text-muted">{row.grade || "—"}</td>
                      <td className="text-right">
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:underline">View</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
