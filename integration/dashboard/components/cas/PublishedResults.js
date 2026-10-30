'use client';
import { useEffect, useState } from 'react';
import { useParentApp } from '@/components/parent/ParentAppContext';
import DashboardLayout from '@/components/DashboardLayout';
import Report from './Report';
import styles from './PublishedResults.module.css';
export function ParentResults({ reportId }) {
  const { selectedChildId } = useParentApp();
  return <Results key={`${selectedChildId}:${reportId || ''}`} childId={selectedChildId} reportId={reportId} role="parent" />;
}
export function StudentResults({ reportId }) { return <DashboardLayout><Results role="student" reportId={reportId} /></DashboardLayout>; }
function Results({ role, childId, reportId }) {
  const [state, setState] = useState({ data: null, error: '' });
  useEffect(() => {
    if (role === 'parent' && !childId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ ...(childId ? { studentId: childId } : {}), ...(reportId ? { report: reportId } : {}) });
    fetch(`/api/cas-published?${query}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error || result.message || 'Report unavailable');
      setState({ data: result.data, error: '' });
    }).catch(error => { if (error.name !== 'AbortError') setState({ data: null, error: error.message }); });
    return () => controller.abort();
  }, [role, childId, reportId]);
  if (state.error) return <p role="alert">{state.error}</p>;
  if (!state.data) return <p role="status">Loading learning reports…</p>;
  if (reportId) return <div className={styles.report}><Report report={state.data} /></div>;
  return <section className={styles.list}><p>Learning / सिकाइ</p><h1>Continuous Assessment</h1><p>Published learning reports from your school.</p>
    {!state.data.length ? <p>No learning reports have been published yet.</p> : state.data.map(report => <a key={report._id} href={`/${role}/learning/cas/${report._id}`}><strong>{report.snapshot.period.title}</strong><span>{report.snapshot.membership.name} · {report.snapshot.membership.grade} · {report.snapshot.year}</span></a>)}
  </section>;
}
