'use client';

import { useCallback, useEffect, useState } from 'react';
import { rememberValue } from '@pravyo/ui/rememberedState';

/**
 * Shared pieces of the teacher workspace tabs.
 *
 * The workspace is loaded once by the dashboard page and handed to every tab,
 * so switching tabs is instant and never refetches.
 */

export const byGrade = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

export function useTeacherWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback((signal) => {
    fetch('/api/teacher/workspace', { cache: 'no-store', signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Your teaching workspace could not be loaded.');
        if (!signal?.aborted) setWorkspace(payload.data);
      })
      .catch((reason) => {
        if (!signal?.aborted) setError(reason.message || 'Your teaching workspace could not be loaded.');
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reload = () => {
    setError('');
    load();
  };

  return { workspace, error, reload };
}

/** One entry per assigned grade: its subjects, class-teacher role and head count. */
export function gradeSummaries(workspace) {
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
}

/**
 * Open the CAS assessment book already filtered to one exam, grade and subject.
 * Uses the same remembered filters the book reads; anything that no longer
 * matches simply falls back to "choose", so a stale row cannot break it.
 */
export function openMarkEntry(router, row) {
  rememberValue('cas-assessment:tab', 'academic');
  rememberValue('cas-assessment:grade', row.grade);
  rememberValue('cas-assessment:subject', row.subjectId || '');
  rememberValue('cas-assessment:exam', row.examId || '');
  rememberValue('cas-assessment:student', '');
  rememberValue('cas-assessment:theme', '');
  router.push('/teacher/exams/cas');
}
