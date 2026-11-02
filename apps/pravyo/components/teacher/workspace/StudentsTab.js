'use client';

import { useMemo, useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { Users } from 'lucide-react';
import { byGrade, EmptyNote, FilterSelect, SearchBox } from './shared';

/** Active students in the grades this teacher is assigned to. */
export default function StudentsTab({ workspace }) {
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useRememberedState('teacher-workspace:student-grade', 'ALL');
  const [section, setSection] = useRememberedState('teacher-workspace:student-section', 'ALL');

  const all = workspace.students;
  const grades = useMemo(() => [...new Set(all.map((row) => row.grade))].sort(byGrade), [all]);
  const sections = useMemo(
    () => [...new Set(all.filter((row) => grade === 'ALL' || row.grade === grade).map((row) => row.section).filter(Boolean))].sort(),
    [all, grade],
  );

  if (all.length === 0) {
    return (
      <EmptyNote icon={Users} title="No students yet">
        Students appear here once your school assigns you a grade and registers its students.
      </EmptyNote>
    );
  }

  const needle = query.trim().toLowerCase();
  const activeSection = sections.includes(section) ? section : 'ALL';
  const students = all.filter((row) =>
    (grade === 'ALL' || row.grade === grade)
    && (activeSection === 'ALL' || row.section === activeSection)
    && (!needle || row.name.toLowerCase().includes(needle) || String(row.rollNumber).toLowerCase() === needle));

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Search name or roll number" />
        <FilterSelect label="Filter by grade" value={grade} onChange={setGrade} options={grades} allLabel="All my grades" />
        <FilterSelect label="Filter by section" value={activeSection} onChange={setSection} options={sections} allLabel="All sections" />
      </div>
      <p className="px-4 pt-3 text-xs text-muted">{students.length} student{students.length === 1 ? '' : 's'}</p>

      {students.length === 0 ? <p className="p-4 text-sm text-muted">No students match these filters.</p> : (<>
        <ul className="divide-y divide-line sm:hidden">
          {students.map((student) => (
            <li key={student.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-9 shrink-0 text-sm tabular-nums text-muted">{student.rollNumber || '—'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{student.name}</span>
                <span className="block text-xs text-muted">{student.grade}{student.section ? ` · Section ${student.section}` : ''}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted"><tr><th className="w-20 px-4 py-2">Roll</th><th className="px-4 py-2">Student</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Section</th></tr></thead>
            <tbody>{students.map((student) => (
              <tr key={student.id}>
                <td className="px-4 py-2 tabular-nums text-muted">{student.rollNumber || '—'}</td>
                <td className="px-4 py-2 font-medium text-ink">{student.name}</td>
                <td className="px-4 py-2 text-muted">{student.grade}</td>
                <td className="px-4 py-2 text-muted">{student.section || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </section>
  );
}
