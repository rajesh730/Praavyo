'use client';

import { useMemo, useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { GraduationCap } from 'lucide-react';
import AppDate from '@/components/common/AppDate';
import { byGrade, EmptyNote, FilterSelect, resultSummary, SearchBox } from './shared';

/** Published results for this teacher's subjects, and whole results for their class. */
export default function ResultsTab({ workspace }) {
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useRememberedState('teacher-workspace:result-grade', 'ALL');
  const [exam, setExam] = useRememberedState('teacher-workspace:result-exam', 'ALL');

  const all = workspace.publishedResults;
  const grades = useMemo(() => [...new Set(all.map((row) => row.grade))].sort(byGrade), [all]);
  const exams = useMemo(() => [...new Set(all.map((row) => row.exam).filter(Boolean))], [all]);

  if (all.length === 0) {
    return (
      <EmptyNote icon={GraduationCap} title="No published results yet">
        Results for your subjects, and for your class if you are a class teacher, appear here after the school publishes them.
      </EmptyNote>
    );
  }

  const needle = query.trim().toLowerCase();
  const results = all.filter((row) =>
    (grade === 'ALL' || row.grade === grade)
    && (exam === 'ALL' || row.exam === exam)
    && (!needle || row.studentName.toLowerCase().includes(needle) || String(row.rollNumber).toLowerCase() === needle));

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Search student or roll number" />
        <FilterSelect label="Filter by exam" value={exam} onChange={setExam} options={exams} allLabel="All exams" />
        <FilterSelect label="Filter by grade" value={grade} onChange={setGrade} options={grades} allLabel="All my grades" />
      </div>
      <p className="px-4 pt-3 text-xs text-muted">{results.length} result{results.length === 1 ? '' : 's'}</p>

      {results.length === 0 ? <p className="p-4 text-sm text-muted">No results match these filters.</p> : (<>
        <ul className="divide-y divide-line sm:hidden">
          {results.map((result, index) => (
            <li key={`${result.studentName}-${result.subject || 'overall'}-${index}`} className="px-4 py-2.5">
              <p className="truncate font-medium text-ink">{result.rollNumber ? `${result.rollNumber} · ` : ''}{result.studentName}</p>
              <p className="text-sm text-ink">{resultSummary(result)}</p>
              <p className="text-xs text-muted">{result.grade}{result.exam ? ` · ${result.exam}` : ''} · <AppDate value={result.publishedAt} fallback="—" /></p>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Exam</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Published</th></tr></thead>
            <tbody>{results.map((result, index) => (
              <tr key={`${result.studentName}-${result.subject || 'overall'}-${index}`}>
                <td className="px-4 py-2 font-medium text-ink">{result.rollNumber ? `${result.rollNumber} · ` : ''}{result.studentName}</td>
                <td className="px-4 py-2 text-muted">{result.grade}</td>
                <td className="px-4 py-2 text-muted">{result.exam || '—'}</td>
                <td className="px-4 py-2 text-ink">{resultSummary(result)}</td>
                <td className="px-4 py-2 text-muted"><AppDate value={result.publishedAt} fallback="—" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </section>
  );
}
