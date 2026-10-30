'use client';
import { useEffect, useState } from 'react';
import { useParentApp } from '@/components/parent/ParentAppContext';
import DashboardLayout from '@/components/DashboardLayout';
import Report from './Report';
import styles from './PublishedResults.module.css';
import { academicYearDisplayLabel } from '@pravyo/core/nepaliDate';

/**
 * Student Result — the report cards a school has published, as a guardian or
 * student reads them. Opens straight onto the newest card; earlier years sit in
 * a switcher above it. The card is drawn by the same component the school
 * previews and prints on its own Student Result screen.
 */
export function ParentResults({ reportId }) {
  const { selectedChildId } = useParentApp();
  return <Results key={`${selectedChildId}:${reportId || ''}`} childId={selectedChildId} reportId={reportId} role="parent" />;
}
export function StudentResults({ reportId }) { return <DashboardLayout><Results role="student" reportId={reportId} /></DashboardLayout>; }

function usePublished(childId, reportId, enabled) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({ ...(childId ? { studentId: childId } : {}), ...(reportId ? { report: reportId } : {}) });
    fetch(`/api/cas-published?${query}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || result.message || 'Result unavailable');
      setState({ data: result.data, error: '' });
    }).catch(error => { if (error.name !== 'AbortError') setState({ data: null, error: error.message }); });
    return () => controller.abort();
  }, [childId, reportId, enabled]);
  return state;
}

function Results({ role, childId, reportId }) {
  const ready = role !== 'parent' || Boolean(childId);
  const list = usePublished(childId, null, ready);
  const reports = list.data || [];
  const openId = reportId || reports[0]?._id;
  const open = usePublished(childId, openId, ready && Boolean(openId));

  if (list.error) return <p role="alert">{list.error}</p>;
  if (!list.data) return <p role="status">Loading student result…</p>;

  return <section className={styles.page}>
    <header className={styles.header}>
      <p>Student Result / विद्यार्थी नतिजा</p>
      <h1>Student Result</h1>
      {reports.length > 1 && <nav className={styles.years} aria-label="Published results">
        {reports.map(report => <a key={report._id} href={`/${role}/learning/cas/${report._id}`}
          aria-current={report._id === openId ? 'page' : undefined}>
          {[
            report.snapshot?.examTitle || academicYearDisplayLabel(
              report.snapshot?.academicYear?.label,
              { yearStart: report.snapshot?.academicYear?.yearStart },
            ),
            report.snapshot?.student?.grade,
          ].filter(Boolean).join(' · ') || 'Result'}
        </a>)}
      </nav>}
    </header>
    {!reports.length && !reportId ? <p className={styles.empty}>No result has been published yet. It will appear here as soon as the school publishes it.</p>
      : open.error ? <p role="alert">{open.error}</p>
      : !open.data ? <p role="status">Loading report card…</p>
      : <div className={styles.report}><Report report={open.data} /></div>}
  </section>;
}
