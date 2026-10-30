'use client';

import { TableWrap, Th, Td, Badge } from '../ui/Kit.js';

/**
 * The step-wise result, laid out as the school's worked example
 * (Pravyo_CAS_…_Grade3_Demo_Result.pdf) prints it: a theme table per subject
 * with the sum and the division written out, then the final summary that
 * turns subject grade points into a GPA.
 *
 * Render only. Every figure arrives computed by lib/casResultSheet.js, so
 * Student Progress and Student Result cannot disagree about a number.
 */

export function formatPercent(value) {
  return value === null || value === undefined ? '-' : `${value.toFixed(2)}%`;
}

function formatPoint(value, digits = 1) {
  return value === null || value === undefined ? '-' : value.toFixed(digits);
}

/** "Mero Sirjana" in English, the Nepali title when that is all there is. */
function titleOf(item, t) {
  return t(item.titleEn || item.titleNe, item.titleNe || item.titleEn) || '-';
}

export function FormulaNote({ t }) {
  return (
    <div className="card grid gap-x-6 gap-y-1 px-4 py-3 text-xs text-muted sm:grid-cols-2">
      <p>{t('Full marks = Number of assessments x 4', 'Full marks = Number of assessments x 4')}</p>
      <p>{t('Weighted grade point = Credit hour x Grade point', 'Weighted grade point = Credit hour x Grade point')}</p>
      <p>{t('Obtained marks = Sum of all achievement scores', 'Obtained marks = Sum of all achievement scores')}</p>
      <p>{t('Final GPA = Total weighted grade points / Total credit hours', 'Final GPA = Total weighted grade points / Total credit hours')}</p>
      <p>{t('Achievement % = Obtained marks / Full marks x 100', 'Achievement % = Obtained marks / Full marks x 100')}</p>
    </div>
  );
}

/** Sections 1-4 of the example: one row per theme, then the subject line. */
export function ThemeCalculationTable({ sheet, t }) {
  return (
    <>
      <TableWrap minWidth="56rem">
        <thead>
          <tr>
            <Th>{t('Theme', 'Theme')}</Th>
            <Th className="text-center">{t('No. of assessments', 'No. of assessments')}</Th>
            <Th className="text-center">{t('Full marks', 'Full marks')}</Th>
            <Th>{t('Obtained marks calculation', 'Obtained marks calculation')}</Th>
            <Th>{t('Percentage calculation', 'Percentage calculation')}</Th>
            <Th className="text-center">{t('Grade', 'Grade')}</Th>
          </tr>
        </thead>
        <tbody>
          {sheet.themes.map((theme, index) => (
            <tr key={theme.key || index}>
              <Td label={t('Theme', 'Theme')} className="font-semibold text-ink">
                {titleOf(theme, t)}
              </Td>
              <Td label={t('No. of assessments', 'No. of assessments')} className="sm:text-center">
                {theme.assessments}
                {theme.assessments < theme.outcomeCount && (
                  <span className="block text-2xs text-muted">
                    {t(`of ${theme.outcomeCount}`, `of ${theme.outcomeCount}`)}
                  </span>
                )}
              </Td>
              <Td label={t('Full marks', 'Full marks')} className="sm:text-center">
                {theme.assessments ? theme.fullMarks : '-'}
              </Td>
              <Td label={t('Obtained marks calculation', 'Obtained marks calculation')} className="break-all tabular-nums">
                {theme.assessments
                  ? `${theme.scores.join('+')} = ${theme.obtained}`
                  : <span className="text-muted">{t('Not assessed yet', 'Not assessed yet')}</span>}
              </Td>
              <Td label={t('Percentage calculation', 'Percentage calculation')} className="whitespace-nowrap tabular-nums">
                {theme.assessments
                  ? `${theme.obtained} / (${theme.assessments}x4) x 100 = ${formatPercent(theme.percent)}`
                  : '-'}
              </Td>
              <Td label={t('Grade', 'Grade')} className="font-semibold sm:text-center">
                {theme.grade || '-'}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <div className="card mt-3 grid gap-2 px-4 py-3 text-sm text-ink md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-4">
        <span>{t('Total obtained', 'Total obtained')}: <strong>{sheet.obtained}</strong></span>
        <span className="tabular-nums">
          {t('Subject percentage', 'Subject percentage')}:{' '}
          <strong>
            {sheet.assessments
              ? `${sheet.obtained} / ${sheet.fullMarks} x 100 = ${formatPercent(sheet.percent)}`
              : '-'}
          </strong>
        </span>
        <span>
          {t('Final grade', 'Final grade')}: <strong>{sheet.grade || '-'}</strong>
          <span className="ml-4">
            {t('Grade point', 'Grade point')}: <strong>{formatPoint(sheet.gradePoint)}</strong>
          </span>
        </span>
      </div>
    </>
  );
}

/** Section 5 of the example: subject grade points weighted into the GPA. */
export function FinalSummaryTable({ result, studentName, t }) {
  const subjects = result.subjects || [];
  return (
    <>
      <TableWrap minWidth="44rem">
        <thead>
          <tr>
            <Th>{t('Subject', 'Subject')}</Th>
            <Th className="text-center">{t('Percentage', 'Percentage')}</Th>
            <Th className="text-center">{t('Grade', 'Grade')}</Th>
            <Th className="text-center">{t('Grade point', 'Grade point')}</Th>
            <Th className="text-center">{t('Credit hour', 'Credit hour')}</Th>
            <Th className="text-center">{t('Weighted GP', 'Weighted GP')}</Th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <tr key={subject.subjectCode || index}>
              <Td label={t('Subject', 'Subject')} className="font-semibold text-ink">
                {titleOf(subject, t)}
              </Td>
              <Td label={t('Percentage', 'Percentage')} className="tabular-nums sm:text-center">
                {subject.achievement === null
                  ? <span className="text-muted">{t('Not assessed', 'Not assessed')}</span>
                  : formatPercent(subject.achievement)}
              </Td>
              <Td label={t('Grade', 'Grade')} className="font-semibold sm:text-center">
                {subject.grade || '-'}
              </Td>
              <Td label={t('Grade point', 'Grade point')} className="tabular-nums sm:text-center">
                {formatPoint(subject.gradePoint)}
              </Td>
              <Td label={t('Credit hour', 'Credit hour')} className="tabular-nums sm:text-center">
                {subject.creditHours ?? (
                  <Badge tone="warning">{t('Not set', 'Not set')}</Badge>
                )}
              </Td>
              <Td label={t('Weighted GP', 'Weighted GP')} className="tabular-nums sm:text-center">
                {formatPoint(subject.weightedGradePoint)}
              </Td>
            </tr>
          ))}
          <tr className="font-semibold">
            <Td label={t('Total', 'Total')} className="text-ink">{t('TOTAL', 'TOTAL')}</Td>
            <Td className="hidden sm:table-cell" />
            <Td className="hidden sm:table-cell" />
            <Td className="hidden sm:table-cell" />
            <Td label={t('Credit hour', 'Credit hour')} className="tabular-nums sm:text-center">
              {result.totalCreditHours || '-'}
            </Td>
            <Td label={t('Weighted GP', 'Weighted GP')} className="tabular-nums sm:text-center">
              {result.totalCreditHours ? formatPoint(result.totalWeightedGradePoints) : '-'}
            </Td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="card mt-3 grid overflow-hidden sm:grid-cols-2">
        <div className="bg-brand-soft px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t('Final GPA calculation', 'Final GPA calculation')}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
            {result.gpa === null
              ? '-'
              : `${formatPoint(result.totalWeightedGradePoints)} / ${result.totalCreditHours} = ${result.gpa.toFixed(2)}`}
          </p>
        </div>
        <div className="bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {studentName ? t(`${studentName} final GPA`, `${studentName} final GPA`) : t('Final GPA', 'Final GPA')}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
            {result.gpa === null ? '-' : result.gpa.toFixed(2)}
            {result.overallGrade && (
              <span className="ml-3 text-base text-muted">{result.overallGrade}</span>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
