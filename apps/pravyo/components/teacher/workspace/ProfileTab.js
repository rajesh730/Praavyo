'use client';

import Link from 'next/link';
import { BookOpen, Repeat, UserRound } from 'lucide-react';
import { gradeSummaries } from './shared';

/** Who I am at this school, and what the school has made me responsible for. */
export default function ProfileTab({ workspace }) {
  const { teacher, school } = workspace;
  const grades = gradeSummaries(workspace);
  const details = [
    ['Name', teacher.name],
    ['Username', teacher.username],
    ['Email', teacher.email],
    ['Phone', teacher.phone],
    ['Designation', teacher.designation],
    ['School', school.name],
  ].filter(([, value]) => value);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong"><UserRound aria-hidden /></span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-ink">{teacher.name}</h2>
            <p className="truncate text-sm text-muted">{teacher.designation || 'Teacher'}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-line border-t border-line">
          {details.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-2.5 text-sm">
              <dt className="text-muted">{label}</dt>
              <dd className="break-words font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-xs text-muted">
          To change these details or your password, ask your school office.
        </p>
        {workspace.canSwitchSchool && (
          <Link href="/teacher/select-school" className="btn btn-secondary btn-sm mt-3 inline-flex w-full items-center justify-center gap-1.5">
            <Repeat aria-hidden size={16} /> Switch school
          </Link>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line p-4">
          <BookOpen className="text-brand" aria-hidden />
          <h2 className="font-semibold text-ink">My roles</h2>
        </div>
        {grades.length === 0 ? (
          <p className="p-4 text-sm text-muted">Your school has not assigned you any grades or subjects yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {grades.map((entry) => (
              <li key={entry.grade} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{entry.grade}</p>
                  <span className="text-xs text-muted">{entry.students} student{entry.students === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entry.classTeacher && <span className="badge badge-brand text-xs">Class teacher</span>}
                  {entry.subjects.map((subject) => (
                    <span key={subject} className="badge badge-neutral text-xs">{subject}</span>
                  ))}
                  {!entry.classTeacher && entry.subjects.length === 0 && <span className="text-sm text-muted">No subjects assigned</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
