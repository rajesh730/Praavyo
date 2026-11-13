'use client';

import Link from 'next/link';
import { BookOpen, Repeat } from 'lucide-react';
import { gradeSummaries } from './shared';
import ChangePasswordCard from './ChangePasswordCard';
import { CardHeading, Initials, TableCard, TH, THEAD } from './ui';

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
      <div className="space-y-4">
        <section className="rounded-card border border-line-strong bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Initials name={teacher.name} large />
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-ink">{teacher.name}</h2>
              <p className="truncate text-sm font-semibold text-muted">{teacher.designation || 'Teacher'}</p>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-line border-t border-line">
            {details.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-2.5 text-sm">
                <dt className="text-2xs font-semibold uppercase leading-5 text-muted">{label}</dt>
                <dd className="break-words font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 rounded-control bg-surface-2 px-3 py-2 text-xs font-semibold text-muted">
            To change these details, ask your school office.
          </p>
          {workspace.canSwitchSchool && (
            <Link href="/teacher/select-school" className="btn btn-secondary btn-sm mt-3 inline-flex w-full items-center justify-center gap-1.5">
              <Repeat aria-hidden size={16} /> Switch school
            </Link>
          )}
        </section>

        <ChangePasswordCard />
      </div>

      <TableCard>
        <div className="border-b border-line-strong p-4">
          <CardHeading icon={BookOpen} title="My roles" description="The grades and subjects your school assigned to you." />
        </div>
        {grades.length === 0 ? (
          <p className="m-4 rounded-card border border-dashed border-line-strong p-4 text-sm font-semibold text-muted">
            Your school has not assigned you any grades or subjects yet.
          </p>
        ) : (<>
          <ul className="divide-y divide-line sm:hidden">
            {grades.map((entry) => (
              <li key={entry.grade} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{entry.grade}</p>
                  <span className="text-xs font-semibold text-muted">{entry.students} student{entry.students === 1 ? '' : 's'}</span>
                </div>
                <RoleBadges entry={entry} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm text-ink">
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Grade</th>
                  <th className={TH}>Role and subjects</th>
                  <th className={`${TH} text-right`}>Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {grades.map((entry) => (
                  <tr key={entry.grade} className="transition-colors hover:bg-surface-2">
                    <td className={`${TH} font-semibold text-ink`}>{entry.grade}</td>
                    <td className={TH}><RoleBadges entry={entry} /></td>
                    <td className={`${TH} text-right font-semibold tabular-nums text-ink`}>{entry.students}</td>
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

function RoleBadges({ entry }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-0">
      {entry.classTeacher && <span className="badge badge-brand text-xs">Class teacher</span>}
      {entry.subjects.map((subject) => (
        <span key={subject} className="badge badge-neutral text-xs">{subject}</span>
      ))}
      {!entry.classTeacher && entry.subjects.length === 0 && <span className="text-sm text-muted">No subjects assigned</span>}
    </div>
  );
}
