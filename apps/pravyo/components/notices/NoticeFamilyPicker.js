"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";

/**
 * "Chosen families" for a notice: tick children, and the notice reaches
 * their linked guardians (Notice.targetStudents). Lists the same parent +
 * child roster Parent Messages uses (/api/school/messages/people, read only),
 * so a family appears here once a guardian is linked to the child.
 *
 * `value` = [{ id, name, grade }]; `onChange` receives the new list.
 */
export default function NoticeFamilyPicker({ value = [], onChange, gradeOptions = [] }) {
  const [grade, setGrade] = useState("");
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ loading: false, error: "", rows: [], idle: true });
  const chosen = useMemo(() => new Set(value.map((item) => item.id)), [value]);

  useEffect(() => {
    const term = search.trim();
    if (!grade && term.length < 2) {
      const timer = setTimeout(() => setState({ loading: false, error: "", rows: [], idle: true }), 0);
      return () => clearTimeout(timer);
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "", idle: false }));
      try {
        const url = new URL("/api/school/messages/people", window.location.origin);
        url.searchParams.set("scope", grade ? "GRADE" : "CHOOSE");
        if (grade) url.searchParams.set("grade", grade);
        if (term) url.searchParams.set("search", term);
        const res = await fetch(url, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Families could not be loaded.");
        // One row per child; a child with two guardians lists both names.
        const byStudent = new Map();
        (json.data?.rows || []).forEach((row) => {
          if (!row.studentId) return;
          const entry = byStudent.get(row.studentId) || {
            id: row.studentId,
            name: row.studentName,
            grade: row.grade || "",
            guardians: [],
          };
          if (row.guardianName && !entry.guardians.includes(row.guardianName)) entry.guardians.push(row.guardianName);
          byStudent.set(row.studentId, entry);
        });
        const rows = [...byStudent.values()].sort((a, b) => a.name.localeCompare(b.name));
        if (alive) setState({ loading: false, error: "", rows, idle: false });
      } catch (error) {
        if (alive) setState({ loading: false, error: error.message, rows: [], idle: false });
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [grade, search]);

  const toggle = (row) =>
    onChange(
      chosen.has(row.id)
        ? value.filter((item) => item.id !== row.id)
        : [...value, { id: row.id, name: row.name, grade: row.grade }]
    );
  const allShownChosen = state.rows.length > 0 && state.rows.every((row) => chosen.has(row.id));
  const toggleAllShown = () =>
    onChange(
      allShownChosen
        ? value.filter((item) => !state.rows.some((row) => row.id === item.id))
        : [
            ...value,
            ...state.rows
              .filter((row) => !chosen.has(row.id))
              .map((row) => ({ id: row.id, name: row.name, grade: row.grade })),
          ]
    );

  return (
    <div className="space-y-3 rounded-card border border-line bg-surface-2 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={grade}
          onChange={(event) => setGrade(event.target.value)}
          aria-label="Grade"
          className="input sm:w-40"
        >
          <option value="">Any grade</option>
          {gradeOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search a student or parent name"
            aria-label="Search families"
            className="input w-full pl-9"
          />
        </div>
      </div>

      {value.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink">
            {value.length} {value.length === 1 ? "family" : "families"} chosen
          </p>
          <div className="flex flex-wrap gap-1.5">
            {value.map((item) => (
              <span key={item.id} className="badge badge-brand inline-flex items-center gap-1">
                {item.name}
                {item.grade ? <span className="font-normal opacity-80">· {item.grade}</span> : null}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((entry) => entry.id !== item.id))}
                  aria-label={`Remove ${item.name}`}
                  className="-mr-1 rounded-full p-0.5 hover:bg-surface"
                >
                  <X aria-hidden size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto rounded-control border border-line bg-surface">
        {state.idle ? (
          <p className="p-3 text-sm text-muted">Choose a grade or type at least two letters of a name.</p>
        ) : state.loading ? (
          <p className="p-3 text-sm text-muted">Loading families…</p>
        ) : state.error ? (
          <p className="p-3 text-sm text-danger" role="alert">{state.error}</p>
        ) : state.rows.length === 0 ? (
          <p className="p-3 text-sm text-muted">No families found. A family appears once a guardian is linked to the child.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleAllShown}
              className="flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left text-xs font-semibold text-brand-strong hover:bg-surface-2"
            >
              <Users aria-hidden size={14} />
              {allShownChosen ? "Untick all shown" : `Tick all ${state.rows.length} shown`}
            </button>
            <ul className="divide-y divide-line">
              {state.rows.map((row) => {
                const active = chosen.has(row.id);
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => toggle(row)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 ${active ? "bg-brand-soft" : ""}`}
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                          active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface"
                        }`}
                        aria-hidden
                      >
                        {active ? <Check size={14} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {row.name}
                          {row.grade ? <span className="font-normal text-muted"> · {row.grade}</span> : null}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {row.guardians.join(", ") || "Guardian"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
