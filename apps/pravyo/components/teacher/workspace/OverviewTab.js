'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Repeat, School } from 'lucide-react';
import AppDate from '@/components/common/AppDate';
import TeacherCertificates from './TeacherCertificates';
import { gradeSummaries, openMarkEntry, resultSummary } from './shared';

/** The landing tab: where I work, what is waiting, what was just published. */
export default function OverviewTab({ workspace }) {
  const router = useRouter();
  const grades = gradeSummaries(workspace);
  const classGrades = grades.filter((entry) => entry.classTeacher).map((entry) => entry.grade);

  return (
    <div className="space-y-4">
      <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong"><School aria-hidden /></span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{workspace.school.name}</p>
            <p className="truncate text-sm text-muted">
              {[workspace.teacher.designation, classGrades.length ? `Class teacher · ${classGrades.join(', ')}` : 'Subject teacher'].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        {workspace.canSwitchSchool && (
          <Link href="/teacher/select-school" className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5"><Repeat aria-hidden size={16} /> Switch school</Link>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <Heading title="Open for mark entry" href="/teacher/dashboard?tab=assessment" />
          {workspace.examAccess.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">Nothing to enter right now. Exams appear here when your school opens them for you.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {workspace.examAccess.slice(0, 4).map((row) => (
                <li key={`${row.examId}-${row.grade}-${row.subjectId}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{row.subject} · {row.grade}</span>
                    <span className="block truncate text-xs text-muted">{row.exam}</span>
                  </span>
                  <button type="button" onClick={() => openMarkEntry(router, row)} className="btn btn-soft btn-sm shrink-0">Enter marks</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <Heading title="Latest published results" href="/teacher/dashboard?tab=results" />
          {workspace.publishedResults.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">Results for your subjects and class appear here after the school publishes them.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {workspace.publishedResults.slice(0, 4).map((result, index) => (
                <li key={`${result.studentName}-${result.subject || 'overall'}-${index}`} className="px-4 py-2.5">
                  <p className="truncate text-sm font-medium text-ink">{result.studentName}</p>
                  <p className="truncate text-xs text-muted">{resultSummary(result)} · <AppDate value={result.publishedAt} fallback="—" /></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TeacherCertificates />
    </div>
  );
}

function Heading({ title, href }) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      <Link href={href} className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand">
        See all <ChevronRight aria-hidden size={16} />
      </Link>
    </div>
  );
}
