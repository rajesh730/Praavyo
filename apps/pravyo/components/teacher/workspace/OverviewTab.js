'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, ChevronRight, ClipboardCheck, GraduationCap, PenLine, Repeat, School, Users } from 'lucide-react';
import AppDate from '@/components/common/AppDate';
import TeacherCertificates from './TeacherCertificates';
import { gradeSummaries, openMarkEntry, resultSummary } from './shared';
import { CardHeading, Initials, MetricGrid } from './ui';

/** The landing tab: where I work, what is waiting, what was just published. */
export default function OverviewTab({ workspace }) {
  const router = useRouter();
  const grades = gradeSummaries(workspace);
  const classGrades = grades.filter((entry) => entry.classTeacher).map((entry) => entry.grade);
  const subjectCount = new Set(workspace.assignments.filter((row) => row.subject).map((row) => `${row.grade}|${row.subject.code}`)).size;
  // A fully published exam is locked, so it is not waiting for marks.
  const openForEntry = workspace.examAccess.filter((row) => row.publishStatus !== 'PUBLISHED');
  const totalStudents = workspace.students.length;
  const roleText = classGrades.length ? `Class teacher · ${classGrades.join(', ')}` : 'Subject teacher';
  // A designation of "Class teacher" would otherwise print twice.
  const designation = workspace.teacher.designation
    && !roleText.toLowerCase().startsWith(workspace.teacher.designation.trim().toLowerCase())
    ? workspace.teacher.designation
    : '';

  return (
    <div className="space-y-4">
      <MetricGrid
        cards={[
          { label: 'My Students', value: totalStudents, note: `In ${grades.length} grade${grades.length === 1 ? '' : 's'}`, icon: Users, tone: 'brand' },
          { label: 'Subjects I Teach', value: subjectCount, note: classGrades.length ? `Class teacher · ${classGrades.join(', ')}` : 'Subject teacher', icon: BookOpen, tone: 'success' },
          { label: 'Open for Marks', value: openForEntry.length, note: openForEntry.length ? 'Waiting for your entry' : 'Nothing waiting', icon: PenLine, tone: 'warning' },
          { label: 'Published Results', value: workspace.publishedResults.length, note: 'For your subjects and class', icon: GraduationCap, tone: 'brand' },
        ]}
      />

      <section className="flex flex-col gap-3 rounded-card border border-line-strong bg-surface p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-brand-line bg-brand-soft text-brand-strong"><School aria-hidden /></span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{workspace.school.name}</p>
            <p className="truncate text-sm font-semibold text-muted">
              {[designation, roleText].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {workspace.canSwitchSchool && (
          <Link href="/teacher/select-school" className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5"><Repeat aria-hidden size={16} /> Switch school</Link>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="p-3">
            <CardHeading
              title="Open for mark entry"
              description="CAS exams your school opened for you."
              action={<SeeAll href="/teacher/dashboard?tab=exams" />}
            />
          </div>
          {openForEntry.length === 0 ? (
            <p className="mx-3 mb-3 rounded-card border border-dashed border-line-strong p-4 text-sm font-semibold text-muted">
              {workspace.examAccess.length
                ? 'Nothing to enter right now. Your exams are published, so their marks are locked.'
                : 'Nothing to enter right now. Exams appear here when your school opens them for you.'}
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {openForEntry.slice(0, 5).map((row) => (
                <li key={`${row.examId}-${row.grade}-${row.subjectId}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong">
                    <ClipboardCheck aria-hidden size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{row.subject} · {row.grade}</span>
                    <span className="block truncate text-xs font-semibold text-muted">{row.exam}</span>
                  </span>
                  <button type="button" onClick={() => openMarkEntry(router, row)} className="btn btn-primary btn-sm shrink-0">Enter marks</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="p-3">
            <CardHeading
              title="Latest published results"
              description="The newest results for your subjects and class."
              action={<SeeAll href="/teacher/dashboard?tab=results" />}
            />
          </div>
          {workspace.publishedResults.length === 0 ? (
            <p className="mx-3 mb-3 rounded-card border border-dashed border-line-strong p-4 text-sm font-semibold text-muted">
              Results for your subjects and class appear here after the school publishes them.
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {workspace.publishedResults.slice(0, 5).map((result, index) => (
                <li key={`${result.studentName}-${result.subject || 'overall'}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
                  <Initials name={result.studentName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{result.studentName}</span>
                    <span className="block truncate text-xs font-semibold text-muted">{resultSummary(result)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted"><AppDate value={result.publishedAt} fallback="—" /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {grades.length > 0 && (
        <section className="card p-3">
          <CardHeading
            icon={Users}
            title="Students by Grade"
            description="The grades you teach and your role in each."
          />
          <div className="mt-5 space-y-4">
            {grades.map((entry) => (
              <div key={entry.grade}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{entry.grade}</span>
                    {entry.classTeacher && <span className="badge badge-brand text-xs">Class teacher</span>}
                    {entry.subjects.length > 0 && (
                      <span className="truncate text-xs font-semibold text-muted">{entry.subjects.join(', ')}</span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">{entry.students}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${totalStudents ? Math.round((entry.students / totalStudents) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <TeacherCertificates />
    </div>
  );
}

function SeeAll({ href }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand">
      See all <ChevronRight aria-hidden size={16} />
    </Link>
  );
}
