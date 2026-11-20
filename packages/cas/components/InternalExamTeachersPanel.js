'use client';

import Link from 'next/link';
import { useCasQuery } from '../lib/client/useCas.js';
import { Alert, Badge, Spinner } from './ui/Kit.js';

/**
 * Who enters each subject's marks in one grade's internal exam. Read-only:
 * the Teachers page decides it (a subject teacher of a grade enters that
 * subject in every internal exam of the grade, and nothing else), so nobody
 * can give an English teacher Nepali here (owner, 2026-11-20).
 */
export default function InternalExamTeachersPanel({ exam, grade, t }) {
  const query = useCasQuery(`/api/cas/internal-exams/teachers?${new URLSearchParams({ exam: exam.id })}`);
  const subjects = query.data?.subjects || [];

  return (
    <section className="mt-3 border-t border-line pt-3" aria-label={t(`${exam.name} teachers`, `${exam.name} शिक्षक`)}>
      <p className="mb-3 text-sm text-muted">
        {t(
          `${grade}: each subject's teachers enter its marks for ${exam.name}, on their own Mark Entry, until the results are published. They see no other subject. To change who teaches a subject, use the Teachers page.`,
          `${grade}: हरेक विषयका शिक्षकले ${exam.name} को अङ्क आफ्नै अङ्क प्रविष्टिमा भर्छन्। अरू विषय देख्दैनन्। परिवर्तनका लागि शिक्षक पृष्ठ प्रयोग गर्नुहोस्।`,
        )}{' '}
        <Link href="/school/dashboard?tab=teachers" className="font-medium text-brand underline">{t('Open the Teachers page', 'शिक्षक पृष्ठ खोल्नुहोस्')}</Link>
      </p>
      <Alert tone="danger">{query.error}</Alert>
      {query.loading && !query.data ? <Spinner label={t('Loading teachers…', 'शिक्षक लोड हुँदैछ…')} />
        : !subjects.length ? <p className="text-sm text-muted">{t('This grade has no examined subjects.', 'यस कक्षामा परीक्षा हुने विषय छैन।')}</p>
          : (
            <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
              {subjects.map((subject) => (
                <div key={subject.id} className="card min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2">
                    <h4 className="min-w-0 break-words text-sm font-semibold text-ink">{t(subject.titleEn, subject.titleNe) || subject.code}</h4>
                    <Badge tone={subject.teachers.length ? 'success' : 'warning'}>{subject.teachers.length}</Badge>
                  </div>
                  <p className="px-3 py-3 text-sm text-ink">
                    {subject.teachers.length
                      ? subject.teachers.map((teacher) => teacher.name).join(', ')
                      : <span className="text-muted">{t('No subject teacher yet: only the school can enter these marks.', 'विषय शिक्षक छैन: विद्यालयले मात्र अङ्क भर्न सक्छ।')}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
    </section>
  );
}
