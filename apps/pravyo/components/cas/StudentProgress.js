'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SubjectCard } from '@/components/parent/ChildProgress';
import { createTranslator } from '@/lib/parentI18n';

const t = createTranslator('en');
const pick = (en) => en;

/** Results | Progress, at the top of the student's Learning pages. */
export function StudentLearningSwitch() {
  const pathname = usePathname();
  const tabs = [
    { href: '/student/learning/cas', label: 'Results' },
    { href: '/student/learning/progress', label: 'Progress' },
  ];
  return (
    <nav className="tabs mb-4 w-fit" aria-label="Learning">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`tab ${pathname.startsWith(tab.href) ? 'is-active' : ''}`}
          aria-current={pathname.startsWith(tab.href) ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The student's own progress this year, subject by subject, from the results
 * the school has published — the same view their parents have.
 */
export default function StudentProgress() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let live = true;
    fetch('/api/student/progress', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Progress is not available right now.');
        if (live) setState({ loading: false, error: '', data: json.data });
      })
      .catch((error) => live && setState({ loading: false, error: error.message, data: null }));
    return () => {
      live = false;
    };
  }, []);

  const { loading, error, data } = state;
  return (
    <section className="mx-auto max-w-5xl px-4 py-6">
      <StudentLearningSwitch />
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-ink">My progress</h1>
        <p className="mt-1 text-sm text-muted">
          How you are doing this year, subject by subject, from the results your school has published.
        </p>
      </header>
      {loading ? (
        <div className="h-72 animate-pulse rounded-card bg-surface-2" />
      ) : error || !data ? (
        <p className="card p-4 text-sm text-danger">{error || 'Something went wrong.'}</p>
      ) : !data.available ? (
        <p className="card p-4 text-sm text-muted">
          {data.reason === 'NOT_CAS_GRADE'
            ? `Progress by theme is kept for Grades 1–5. ${data.grade || ''} results appear under Results once the school publishes them.`
            : 'Progress is not available yet.'}
        </p>
      ) : !data.subjects.some((subject) => subject.totals?.assessedCount) ? (
        <p className="card p-4 text-sm text-muted">Your progress appears here once the school publishes a result.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{t('progress.levels')}</p>
          <div className="space-y-3">
            {data.subjects.map((subject) => (
              <SubjectCard key={subject.subject.id} subject={subject} pick={pick} t={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
