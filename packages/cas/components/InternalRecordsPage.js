'use client';

import Link from 'next/link';
import { CalendarCheck, ClipboardList } from 'lucide-react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { useCas } from './CasLayout.js';
import { useCasQuery } from '../lib/client/useCas.js';
import { Alert, Card, EmptyState, PageHeader, Spinner } from './ui/Kit.js';
import { InternalExamFilterBar, useInternalExamFilters } from './InternalExamFilters.js';
import StudentRecordsTable from './StudentRecordsTable.js';

/**
 * Attendance and extra activities for an internal exam, printed on that
 * exam's report card. These belong to the internal exam only; CAS does not
 * collect them. School admin only; locked while the exam is published.
 */
export default function InternalRecordsPage() {
  const { actor, t } = useCas();
  const [mode, setMode] = useRememberedState('internal-exam:records-tab', 'attendance');
  const filters = useInternalExamFilters();
  const { exam, section } = filters;
  const isSchool = actor?.role === 'SCHOOL_ADMIN';
  const recordsPath = isSchool && exam
    ? `/api/cas/internal-exams/records?${new URLSearchParams({ exam: exam.id, ...(section ? { section } : {}) })}`
    : null;
  const recordsQuery = useCasQuery(recordsPath);
  const table = recordsQuery.data;

  const tabs = [
    { id: 'attendance', label: t('Attendance', 'हाजिरी'), icon: CalendarCheck },
    { id: 'activities', label: t('Extra Activities', 'अतिरिक्त क्रियाकलाप'), icon: ClipboardList },
  ];

  if (!isSchool) {
    return (
      <Card>
        <EmptyState
          title={t('Attendance is recorded by the school', 'हाजिरी विद्यालयले राख्छ')}
          description={t('Enter your marks on Mark Entry.', 'Mark Entry मा अङ्क प्रविष्ट गर्नुहोस्।')}
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
        title={t('Attendance & Activities', 'हाजिरी र क्रियाकलाप')}
        description={t(
          'Record each student’s attendance and extra activities for this exam. They print on the exam’s report card.',
          'यस परीक्षाको लागि प्रत्येक विद्यार्थीको हाजिरी र अतिरिक्त क्रियाकलाप राख्नुहोस्। यी नतिजा पत्रमा छापिन्छन्।',
        )}
      />

      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label={t('Record type', 'रेकर्ड प्रकार')}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.id)}
              className={`btn btn-secondary inline-flex items-center gap-2 font-semibold transition-colors ${
                active ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-brand hover:bg-brand-soft'
              }`}
            >
              <Icon size={14} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      <InternalExamFilterBar filters={filters} t={t} />
      <Alert tone="danger">{recordsQuery.error}</Alert>

      {!exam ? (
        filters.examsQuery.loading ? <Card><Spinner /></Card> : (
          <Card>
            <EmptyState
              title={t('No internal exam for this grade yet', 'यस कक्षाको आन्तरिक परीक्षा छैन')}
              description={t('Each exam has its own working days and present days, printed on that exam’s report card.', 'हरेक परीक्षाको आफ्नै कार्य दिन र उपस्थित दिन हुन्छ।')}
              action={<Link href="/school/internal-exam/exams" className="btn btn-primary">{t('Manage exams', 'परीक्षा व्यवस्थापन')}</Link>}
            />
          </Card>
        )
      ) : !table ? (
        <Card><Spinner /></Card>
      ) : !table.students.length ? (
        <Card><EmptyState title={t('No students in this grade or section', 'यस कक्षामा विद्यार्थी छैनन्')} /></Card>
      ) : (
        <StudentRecordsTable
          key={`${mode}:${recordsPath}`}
          mode={mode}
          table={table}
          onSaved={recordsQuery.setData}
          t={t}
        />
      )}
    </>
  );
}
