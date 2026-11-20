'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { useCas } from './CasLayout.js';
import { useCasQuery } from '../lib/client/useCas.js';
import { sectionsForGrade } from '../lib/casSections.js';
import { Card, Field, Select } from './ui/Kit.js';
import { InternalExamCreateDialog } from './InternalExamForm.js';

/**
 * Year → grade → section → exam, shared by the three internal-exam screens.
 * A teacher only sees the grades they teach (Teachers page assignments).
 * The screens share one set of choices, so picking an exam on Manage Exams
 * carries over to Mark Entry and Results; choices last until a refresh.
 */
export function useInternalExamFilters({ withSection = true } = {}) {
  const { school, years, academicYear, setYearId, actor, api } = useCas();
  const [chosenGrade, setGrade] = useRememberedState('internal-exam:grade', '');
  const [chosenSection, setSection] = useRememberedState('internal-exam:section', '');
  const [chosenExam, setExam] = useRememberedState('internal-exam:exam', '');

  const gradesQuery = useCasQuery(actor?.role === 'TEACHER' ? api.internal() : null);
  const taught = gradesQuery.data?.grades;
  const grades = (school?.grades || []).filter((item) => !taught || taught.includes(item));
  const grade = grades.includes(chosenGrade) ? chosenGrade : grades[0] || '';
  const sections = sectionsForGrade(school?.gradeSections, grade);
  const section = withSection && sections.includes(chosenSection) ? chosenSection : '';

  const examsPath = grade && academicYear?.id
    ? `${api.internal()}?${new URLSearchParams({ academicYear: academicYear.id, grade })}`
    : null;
  const examsQuery = useCasQuery(examsPath);
  const exams = examsQuery.data?.exams || [];
  const exam = exams.find((item) => item.id === chosenExam) || exams.at(-1) || null;

  return {
    years, academicYear, setYearId,
    grades, grade, setGrade: (value) => { setGrade(value); setSection(''); setExam(''); },
    sections, section, setSection,
    exams, exam, setExam,
    subjects: examsQuery.data?.subjects || [],
    examsQuery,
    loading: gradesQuery.loading,
  };
}

const CREATE_EXAM = '__create__';

export function InternalExamFilterBar({ filters, t, showExam = true, withSection = true }) {
  const { years, academicYear, setYearId, grades, grade, setGrade, sections, section, setSection, exams, exam, setExam, examsQuery } = filters;
  const { actor, api } = useCas();
  // The school can create an exam right from the picker (teachers cannot).
  const canCreate = showExam && actor?.role === 'SCHOOL_ADMIN' && api.audience === 'school' && Boolean(grade && academicYear?.id);
  const [creating, setCreating] = useState(false);

  function chooseExam(value) {
    if (value === CREATE_EXAM) setCreating(true);
    else setExam(value);
  }

  return (
    <Card>
      {creating && (
        <InternalExamCreateDialog
          api={api}
          academicYear={academicYear}
          grade={grade}
          calendar={actor?.calendar}
          t={t}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setExam(created.id);
            examsQuery.reload();
          }}
        />
      )}
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('Academic year', 'शैक्षिक वर्ष')}>
          <Select value={academicYear?.id || ''} onChange={(event) => { setYearId(event.target.value); setExam(''); }}>
            {(years || []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
          </Select>
        </Field>
        <Field label={t('Grade', 'कक्षा')}>
          <Select value={grade} onChange={(event) => setGrade(event.target.value)} disabled={!grades.length}>
            {!grades.length && <option value="">{t('No grades', 'कक्षा छैन')}</option>}
            {grades.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </Field>
        {withSection && (
          <Field label={t('Section', 'सेक्सन')}>
            <Select value={section} onChange={(event) => setSection(event.target.value)} disabled={!sections.length}>
              <option value="">{sections.length ? t('All sections', 'सबै सेक्सन') : t('No sections', 'सेक्सन छैन')}</option>
              {sections.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
        )}
        {showExam && (
          <Field label={t('Exam', 'परीक्षा')}>
            <Select value={exam?.id || ''} onChange={(event) => chooseExam(event.target.value)} disabled={!exams.length && !canCreate}>
              {!exams.length && <option value="">{t('No exams yet', 'परीक्षा छैन')}</option>}
              {exams.map((item) => <option key={item.id} value={item.id}>{item.name}{item.published ? ` (${t('published', 'प्रकाशित')})` : ''}</option>)}
              {canCreate && <option value={CREATE_EXAM}>{t('+ Create exam', '+ परीक्षा सिर्जना')}</option>}
            </Select>
          </Field>
        )}
      </div>
    </Card>
  );
}
