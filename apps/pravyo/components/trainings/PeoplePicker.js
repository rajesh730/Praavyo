"use client";

import { useMemo, useState } from "react";
import { CheckSquare, ChevronDown, ChevronRight, MinusSquare, Search, Square, X } from "lucide-react";

/**
 * The people list behind a training's Register screen.
 *
 * Filters (search, grade chips, section) only narrow what is SHOWN — what is
 * chosen or marked stays. People are grouped by grade; a grade's header
 * takes or marks the WHOLE grade, not just the rows the filters show.
 * Checkboxes: `chosen` Set + `onChoose(ids, on)`.
 */
const byGrade = (a, b) => a.localeCompare(b, undefined, { numeric: true });

export function groupByGrade(people) {
  const groups = new Map();
  for (const person of people) {
    const key = person.grade || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(person);
  }
  return [...groups.entries()].sort(([a], [b]) => byGrade(a, b)).map(([grade, rows]) => ({ grade, rows }));
}

export default function PeoplePicker({ people, chosen, onChoose, readOnly = false, noun = "students" }) {
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());

  const groups = useMemo(() => groupByGrade(people), [people]);
  const grades = groups.map((group) => group.grade).filter(Boolean);
  const sections = useMemo(() => [...new Set(people.map((person) => person.section).filter(Boolean))].sort(byGrade), [people]);
  const query = search.trim().toLowerCase();
  const matches = (person) =>
    (!section || person.section === section) && (!query || `${person.name} ${person.detail || ""}`.toLowerCase().includes(query));
  const shownGroups = groups
    .filter((group) => !grade || group.grade === grade)
    .map((group) => ({ ...group, shown: group.rows.filter(matches) }))
    .filter((group) => group.shown.length);
  const filtering = Boolean(query || grade || section);

  const toggleCollapse = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-card border border-line">
      {/* Filters */}
      <div className="space-y-2.5 border-b border-line bg-surface-2 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${noun}`}
              className="input w-full bg-surface pl-9"
              aria-label={`Search ${noun}`}
            />
          </div>
          {sections.length > 1 && (
            <select value={section} onChange={(event) => setSection(event.target.value)} className="input bg-surface sm:w-44" aria-label="Section">
              <option value="">All sections</option>
              {sections.map((value) => (
                <option key={value} value={value}>Section {value}</option>
              ))}
            </select>
          )}
        </div>
        {grades.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show grade">
            {[["", "All grades", people.length], ...groups.map((group) => [group.grade, group.grade, group.rows.length])].map(([value, label, count]) => {
              const active = grade === value;
              return (
                <button
                  key={value || "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGrade(value)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-body hover:border-brand-line"
                  }`}
                >
                  {label} <span className={active ? "text-white/80" : "text-muted"}>{count}</span>
                </button>
              );
            })}
            {filtering && (
              <button type="button" onClick={() => { setSearch(""); setGrade(""); setSection(""); }} className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
                <X aria-hidden /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="max-h-[28rem] overflow-y-auto">
        {shownGroups.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted">Nobody matches these filters.</p>
        ) : (
          shownGroups.map((group) => {
            const key = group.grade || "_";
            const open = !collapsed.has(key);
            const ids = group.rows.map((person) => person.id);
            return (
              <section key={key} className="border-b border-line last:border-b-0">
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface px-3 py-2 shadow-[0_1px_0_var(--color-line)]">
                  <GradeCheck rows={group.rows} chosen={chosen} onChoose={onChoose} disabled={readOnly} label={group.grade || noun} />
                  <button type="button" onClick={() => toggleCollapse(key)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="truncate text-sm font-semibold text-ink">{group.grade || (noun === "teachers" ? "Teachers" : "Students")}</span>
                    <span className="truncate text-xs text-muted">
                      {selectSummary(group.rows, chosen)}
                    </span>
                    <span className="ml-auto shrink-0 text-muted">{open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}</span>
                  </button>
                </div>
                {open && (
                  <ul className="divide-y divide-line">
                    {group.shown.map((person) => (
                      <SelectRow key={person.id} person={person} on={chosen.has(person.id)} onChoose={onChoose} disabled={readOnly} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function selectSummary(rows, chosen) {
  const count = rows.filter((person) => chosen.has(person.id)).length;
  if (count === 0) return `None of ${rows.length}`;
  if (count === rows.length) return `Whole grade · ${count}`;
  return `${count} of ${rows.length} chosen`;
}


function GradeCheck({ rows, chosen, onChoose, disabled, label }) {
  const count = rows.filter((person) => chosen.has(person.id)).length;
  const all = count === rows.length;
  const Icon = all ? CheckSquare : count ? MinusSquare : Square;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(rows.map((person) => person.id), !all)}
      aria-label={all ? `Remove all of ${label}` : `Take all of ${label}`}
      title={all ? "Remove the whole grade" : "Take the whole grade"}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-control hover:bg-surface-2"
    >
      <Icon className={count ? "text-brand" : "text-subtle"} aria-hidden />
    </button>
  );
}

function SelectRow({ person, on, onChoose, disabled }) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChoose([person.id], !on)}
        aria-pressed={on}
        className={`flex w-full items-center gap-3 py-2 pl-5 pr-3 text-left text-sm transition-colors hover:bg-surface-2 ${on ? "bg-brand-soft/40" : ""}`}
      >
        {on ? <CheckSquare className="shrink-0 text-brand" aria-hidden /> : <Square className="shrink-0 text-subtle" aria-hidden />}
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{person.name}</span>
        {person.detail && <span className="shrink-0 text-xs text-muted">{person.detail}</span>}
      </button>
    </li>
  );
}

