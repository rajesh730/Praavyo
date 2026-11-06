"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Everyone a school registered for a training — the school's own card and
 * Praavyo's school row both use it. Filters: name search, grade, section,
 * attendance. Each row shows attendance and, once issued, the certificate.
 */
const byGrade = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const ATTENDANCE = [
  ["ALL", "All"],
  ["PRESENT", "Present"],
  ["ABSENT", "Absent"],
  ["NONE", "Not marked"],
];

export default function ParticipantTable({ participants = [], certificates = [], teachers = false }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [attendance, setAttendance] = useState("ALL");

  const certificateOf = useMemo(() => new Map(certificates.map((row) => [row.personId, row])), [certificates]);
  const grades = useMemo(() => [...new Set(participants.map((row) => row.grade).filter(Boolean))].sort(byGrade), [participants]);
  const sections = useMemo(() => [...new Set(participants.map((row) => row.section).filter(Boolean))].sort(byGrade), [participants]);
  const count = (value) =>
    value === "ALL" ? participants.length : participants.filter((row) => (value === "NONE" ? !row.attendance : row.attendance === value)).length;

  const term = query.trim().toLowerCase();
  const shown = participants
    .filter(
      (row) =>
        (!grade || row.grade === grade) &&
        (!section || row.section === section) &&
        (attendance === "ALL" || (attendance === "NONE" ? !row.attendance : row.attendance === attendance)) &&
        (!term || row.name.toLowerCase().includes(term))
    )
    .sort((a, b) => byGrade(a.grade || "", b.grade || "") || a.name.localeCompare(b.name));
  const filtering = Boolean(term || grade || section || attendance !== "ALL");

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="flex flex-col gap-2 border-b border-line bg-surface-2 p-3 lg:flex-row lg:items-center">
        <label className="relative block flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${teachers ? "teachers" : "students"}`} className="input w-full bg-surface pl-9" aria-label="Search" />
        </label>
        {!teachers && grades.length > 1 && (
          <select value={grade} onChange={(event) => setGrade(event.target.value)} className="input bg-surface lg:w-40" aria-label="Grade">
            <option value="">All grades</option>
            {grades.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        )}
        {sections.length > 1 && (
          <select value={section} onChange={(event) => setSection(event.target.value)} className="input bg-surface lg:w-40" aria-label="Section">
            <option value="">All sections</option>
            {sections.map((value) => <option key={value} value={value}>Section {value}</option>)}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Attendance">
          {ATTENDANCE.filter(([value]) => value === "ALL" || count(value) > 0).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={attendance === value}
              onClick={() => setAttendance(value)}
              className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${attendance === value ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-body hover:border-brand-line"}`}
            >
              {label} <span className={attendance === value ? "text-white/80" : "text-muted"}>{count(value)}</span>
            </button>
          ))}
          {filtering && (
            <button type="button" onClick={() => { setQuery(""); setGrade(""); setSection(""); setAttendance("ALL"); }} className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
              <X aria-hidden /> Clear
            </button>
          )}
        </div>
      </div>

      <p className="border-b border-line px-3 py-1.5 text-xs text-muted">Showing {shown.length} of {participants.length}</p>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted">Nobody matches these filters.</p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-10 text-left">#</th>
                <th className="text-left">Name</th>
                {!teachers && <th className="text-left">Grade</th>}
                <th className="text-left">Attendance</th>
                <th className="text-right">Certificate</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const certificate = certificateOf.get(row.id);
                return (
                  <tr key={row.id}>
                    <td className="tabular-nums text-muted">{index + 1}</td>
                    <td className="font-medium text-ink">{row.name}</td>
                    {!teachers && <td className="text-muted">{[row.grade, row.section && `Sec ${row.section}`].filter(Boolean).join(" · ") || "—"}</td>}
                    <td>
                      {row.attendance === "PRESENT" ? <span className="badge badge-success">Present</span>
                        : row.attendance === "ABSENT" ? <span className="badge badge-danger">Absent</span>
                        : <span className="badge badge-neutral">Not marked</span>}
                    </td>
                    <td className="text-right">
                      {certificate
                        ? <a href={certificate.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:underline">View</a>
                        : <span className="text-xs text-subtle">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
