'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import Link from 'next/link';
import { BookOpen, ClipboardCheck, GraduationCap, Repeat, School, Users } from 'lucide-react';
import LoadingState from '@/components/ui/LoadingState';
import AlertBanner from '@/components/ui/AlertBanner';
import AppDate from '@/components/common/AppDate';

const byGrade = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

export default function TeacherAcademicWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState('');
  const [studentGrade, setStudentGrade] = useRememberedState("teacher-workspace:student-grade", 'ALL');
  const [resultGrade, setResultGrade] = useRememberedState("teacher-workspace:result-grade", 'ALL');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/teacher/workspace', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Your teaching workspace could not be loaded.');
        return payload.data;
      })
      .then((data) => !controller.signal.aborted && setWorkspace(data))
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message || 'Your teaching workspace could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  const grades = useMemo(() => {
    if (!workspace) return [];
    const map = new Map();
    workspace.assignments.forEach((assignment) => {
      if (!map.has(assignment.grade)) map.set(assignment.grade, { grade: assignment.grade, subjects: [], classTeacher: false });
      const entry = map.get(assignment.grade);
      if (assignment.assignmentType === 'CLASS_TEACHER') entry.classTeacher = true;
      else if (assignment.subject) entry.subjects.push(assignment.subject.title);
    });
    return [...map.values()].sort((a, b) => byGrade(a.grade, b.grade)).map((entry) => ({
      ...entry,
      students: workspace.students.filter((student) => student.grade === entry.grade).length,
    }));
  }, [workspace]);

  if (error) return <AlertBanner type="error" title="Workspace unavailable" message={error} />;
  if (!workspace) return <LoadingState title="Loading teaching workspace" message="Checking your school-assigned grades and subjects." />;

  const students = workspace.students.filter((student) => studentGrade === 'ALL' || student.grade === studentGrade);
  const results = workspace.publishedResults.filter((result) => resultGrade === 'ALL' || result.grade === resultGrade);

  return (
    <div className="space-y-4">
      <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong"><School aria-hidden /></span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{workspace.school.name}</p>
            <p className="truncate text-sm text-muted">
              {workspace.teacher.name}{workspace.teacher.designation ? ` · ${workspace.teacher.designation}` : ''} · {workspace.teacher.username || workspace.teacher.email}
            </p>
          </div>
        </div>
        {workspace.canSwitchSchool && (
          <Link href="/teacher/select-school" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"><Repeat aria-hidden size={16} /> Switch school</Link>
        )}
      </section>

      <section className="card p-4">
        <div className="flex items-center gap-2"><BookOpen className="text-brand" aria-hidden /><h2 className="font-semibold text-ink">My classes and subjects</h2></div>
        {grades.length === 0 ? <p className="mt-3 text-sm text-muted">Your school has not assigned you any grades or subjects yet.</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grades.map((entry) => (
              <div key={entry.grade} className="rounded-control border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{entry.grade}</p>
                  {entry.classTeacher && <span className="badge badge-brand text-xs">Class Teacher</span>}
                </div>
                <p className="mt-2 text-sm text-ink">{entry.subjects.length ? entry.subjects.join(', ') : 'No subjects assigned'}</p>
                <p className="mt-1 text-xs text-muted">{entry.students} student{entry.students === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><ClipboardCheck className="text-brand" aria-hidden /><h2 className="font-semibold text-ink">Exam mark entry</h2></div>
          {workspace.examAccess.length > 0 && <Link href="/school/cas/assessment" className="btn btn-primary btn-sm">Enter marks</Link>}
        </div>
        {workspace.examAccess.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Your school has not opened any exam for you to enter marks yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {workspace.examAccess.map((row) => (
              <li key={`${row.exam}-${row.grade}-${row.subject}`} className="rounded-control border border-line px-3 py-1.5 text-sm text-ink">
                {row.exam} · {row.grade} · {row.subject}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Users className="text-brand" aria-hidden /><h2 className="font-semibold text-ink">My students</h2><span className="text-sm text-muted">({students.length})</span></div>
          {grades.length > 1 && (
            <select className="input sm:w-48" value={studentGrade} onChange={(event) => setStudentGrade(event.target.value)} aria-label="Filter students by grade">
              <option value="ALL">All my grades</option>
              {grades.map((entry) => <option key={entry.grade} value={entry.grade}>{entry.grade}</option>)}
            </select>
          )}
        </div>
        {students.length === 0 ? <p className="p-4 text-sm text-muted">No active students are listed in your assigned grades.</p> : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-4 py-2">Roll</th><th className="px-4 py-2">Student</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Section</th></tr></thead>
              <tbody className="divide-line">{students.map((student) => (
                <tr key={student.id}><td className="px-4 py-2 text-muted">{student.rollNumber || '—'}</td><td className="px-4 py-2 font-medium text-ink">{student.name}</td><td className="px-4 py-2 text-muted">{student.grade}</td><td className="px-4 py-2 text-muted">{student.section || '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><GraduationCap className="text-brand" aria-hidden /><h2 className="font-semibold text-ink">Published results</h2></div>
          {grades.length > 1 && (
            <select className="input sm:w-48" value={resultGrade} onChange={(event) => setResultGrade(event.target.value)} aria-label="Filter results by grade">
              <option value="ALL">All my grades</option>
              {grades.map((entry) => <option key={entry.grade} value={entry.grade}>{entry.grade}</option>)}
            </select>
          )}
        </div>
        {results.length === 0 ? <p className="p-4 text-sm text-muted">Results for your subjects and class appear here after the school publishes them.</p> : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-surface-2 text-xs text-muted"><tr><th className="px-4 py-2">Student</th><th className="px-4 py-2">Grade</th><th className="px-4 py-2">Exam</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Published</th></tr></thead>
              <tbody className="divide-line">{results.map((result, index) => (
                <tr key={`${result.studentName}-${result.subject || 'overall'}-${index}`}>
                  <td className="px-4 py-2 font-medium text-ink">{result.rollNumber ? `${result.rollNumber} · ` : ''}{result.studentName}</td>
                  <td className="px-4 py-2 text-muted">{result.grade}</td>
                  <td className="px-4 py-2 text-muted">{result.exam || '—'}</td>
                  <td className="px-4 py-2 text-ink">{result.kind === 'CLASS_RESULT'
                    ? `Overall: ${result.overallGrade || '—'}${result.gpa != null ? ` · GPA ${result.gpa}` : ''}`
                    : `${result.subject}: ${result.gradeResult || '—'}${result.obtained != null ? ` · ${result.obtained}/${result.fullMarks ?? '—'}` : ''}`}</td>
                  <td className="px-4 py-2 text-muted"><AppDate value={result.publishedAt} fallback="—" /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
