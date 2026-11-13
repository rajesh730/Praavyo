'use client';

import { useMemo, useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { BookOpen, Layers, UserCheck, Users } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { byGrade, gradeSummaries } from './shared';
import {
  ClearFiltersButton, downloadCsv, ExportButton, FilterPanel, Initials, MetricGrid,
  ResultCount, SearchField, SelectField, TableCard, TH, THEAD, usePagedList,
} from './ui';

/** Active students in the grades this teacher is assigned to. */
export default function StudentsTab({ workspace }) {
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useRememberedState('teacher-workspace:student-grade', 'ALL');
  const [section, setSection] = useRememberedState('teacher-workspace:student-section', 'ALL');
  const [role, setRole] = useRememberedState('teacher-workspace:student-role', 'ALL');

  const all = workspace.students;
  const roles = useMemo(() => {
    const map = new Map();
    gradeSummaries(workspace).forEach((entry) => map.set(entry.grade, entry));
    return map;
  }, [workspace]);
  const grades = useMemo(() => [...new Set(all.map((row) => row.grade))].sort(byGrade), [all]);
  const activeGrade = grades.includes(grade) ? grade : 'ALL';
  const sections = useMemo(
    () => [...new Set(all.filter((row) => activeGrade === 'ALL' || row.grade === activeGrade).map((row) => row.section).filter(Boolean))].sort(),
    [all, activeGrade],
  );
  const activeSection = sections.includes(section) ? section : 'ALL';
  const hasClass = [...roles.values()].some((entry) => entry.classTeacher);
  const activeRole = hasClass ? role : 'ALL';

  const needle = query.trim().toLowerCase();
  const students = all.filter((row) => {
    const entry = roles.get(row.grade);
    return (activeGrade === 'ALL' || row.grade === activeGrade)
      && (activeSection === 'ALL' || row.section === activeSection)
      && (activeRole === 'ALL' || (activeRole === 'CLASS') === Boolean(entry?.classTeacher))
      && (!needle || row.name.toLowerCase().includes(needle) || String(row.rollNumber).toLowerCase() === needle);
  });
  const filterKey = `${needle}|${activeGrade}|${activeSection}|${activeRole}`;
  const { pageItems, pagination } = usePagedList(students, { resetKey: filterKey });

  if (all.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Students appear here once your school assigns you a grade and registers its students."
        />
      </div>
    );
  }

  const classStudents = all.filter((row) => roles.get(row.grade)?.classTeacher).length;
  const sectionCount = new Set(all.filter((row) => row.section).map((row) => `${row.grade}|${row.section}`)).size;
  const filtered = filterKey !== '|ALL|ALL|ALL';

  const clear = () => {
    setQuery('');
    setGrade('ALL');
    setSection('ALL');
    setRole('ALL');
  };

  const exportCsv = () => downloadCsv(
    `My students${activeGrade === 'ALL' ? '' : ` - ${activeGrade}`}.csv`,
    ['Roll Number', 'Name', 'Grade', 'Section', 'My role'],
    students.map((row) => [row.rollNumber, row.name, row.grade, row.section, roleLabel(roles.get(row.grade))]),
  );

  return (
    <div className="space-y-4">
      <MetricGrid
        cards={[
          { label: 'My Students', value: all.length, note: `Across ${grades.length} grade${grades.length === 1 ? '' : 's'}`, icon: Users, tone: 'brand' },
          { label: 'Grades I Teach', value: grades.length, note: grades.join(', ') || '—', icon: BookOpen, tone: 'success' },
          { label: 'Sections', value: sectionCount, note: sectionCount ? 'In my grades' : 'No sections set', icon: Layers, tone: 'warning' },
          { label: 'My Class', value: classStudents, note: hasClass ? 'Students I am class teacher of' : 'Not a class teacher', icon: UserCheck, tone: 'brand' },
        ]}
      />

      <FilterPanel columns={hasClass
        ? 'xl:grid-cols-[minmax(240px,1fr)_170px_170px_170px_auto_auto]'
        : 'xl:grid-cols-[minmax(240px,1fr)_180px_180px_auto_auto]'}
      >
        <SearchField value={query} onChange={setQuery} placeholder="Search by name or roll number..." />
        <SelectField
          label="Filter by grade"
          value={activeGrade}
          onChange={(value) => { setGrade(value); setSection('ALL'); }}
          options={grades}
          allLabel="All My Grades"
        />
        <SelectField label="Filter by section" value={activeSection} onChange={setSection} options={sections} allLabel="All Sections" />
        {hasClass && (
          <SelectField
            label="Filter by my role"
            value={activeRole}
            onChange={setRole}
            options={[{ value: 'CLASS', label: 'My class' }, { value: 'SUBJECT', label: 'Subject classes' }]}
            allLabel="All Roles"
          />
        )}
        <ClearFiltersButton onClick={clear} disabled={!filtered} />
        <ExportButton onClick={exportCsv} disabled={students.length === 0} />
      </FilterPanel>

      <TableCard footer={students.length > 0 ? pagination : null}>
        <div className="flex items-center justify-between gap-3 border-b border-line-strong px-4 py-2.5">
          <ResultCount shown={students.length} total={all.length} noun="student" />
        </div>

        {students.length === 0 ? (
          <EmptyState
            title="No students match these filters"
            description="Try a different name or roll number, or clear the filters."
            actionLabel="Clear Filters"
            onAction={clear}
          />
        ) : (<>
          <ul className="divide-y divide-line sm:hidden">
            {pageItems.map((student) => (
              <li key={student.id} className="flex items-center gap-3 px-4 py-3">
                <Initials name={student.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{student.name}</span>
                  <span className="block text-xs font-semibold text-muted">
                    {student.grade}{student.section ? ` · Section ${student.section}` : ''} · Roll {student.rollNumber || '—'}
                  </span>
                </span>
                <RoleBadges entry={roles.get(student.grade)} compact />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm text-ink">
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Student</th>
                  <th className={`${TH} w-24`}>Roll</th>
                  <th className={TH}>Grade</th>
                  <th className={TH}>Section</th>
                  <th className={TH}>My role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-surface-2">
                    <td className={TH}>
                      <div className="flex items-center gap-3">
                        <Initials name={student.name} />
                        <span className="min-w-0 truncate font-semibold text-ink">{student.name}</span>
                      </div>
                    </td>
                    <td className={`${TH} tabular-nums font-semibold text-muted`}>{student.rollNumber || '—'}</td>
                    <td className={`${TH} font-semibold text-ink`}>{student.grade}</td>
                    <td className={`${TH} text-muted`}>{student.section || '—'}</td>
                    <td className={TH}><RoleBadges entry={roles.get(student.grade)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </TableCard>
    </div>
  );
}

function roleLabel(entry) {
  if (!entry) return '';
  return [entry.classTeacher ? 'Class teacher' : '', ...entry.subjects].filter(Boolean).join('; ');
}

/** Class teacher and the subjects this teacher takes in the student's grade. */
function RoleBadges({ entry, compact = false }) {
  if (!entry) return <span className="text-xs text-muted">—</span>;
  if (compact) {
    return entry.classTeacher
      ? <span className="badge badge-brand shrink-0 text-xs">Class teacher</span>
      : <span className="badge badge-neutral shrink-0 text-xs">{entry.subjects.length} subject{entry.subjects.length === 1 ? '' : 's'}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entry.classTeacher && <span className="badge badge-brand text-xs">Class teacher</span>}
      {entry.subjects.map((subject) => <span key={subject} className="badge badge-neutral text-xs">{subject}</span>)}
    </div>
  );
}
