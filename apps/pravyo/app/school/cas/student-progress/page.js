'use client';

import { useRememberedState } from '@pravyo/ui/rememberedState';
import { LineChart as FaChartLine, BookOpen as FaBookOpen } from 'lucide-react';
import { useCas } from '@pravyo/cas/components/CasLayout';
import { useCasQuery } from '@pravyo/cas/lib/client/useCas';
import {
  PageHeader, Card, Field, Select, Alert, Spinner, EmptyState,
  Badge, TableWrap, Th, Td, LevelChip, LevelLegend,
} from '@pravyo/cas/components/ui/Kit';
import {
  ThemeCalculationTable, FormulaNote, formatPercent,
} from '@pravyo/cas/components/result/ResultTables';
import { subjectResultSheet, RESULT_SHEET_UNAVAILABLE } from '@pravyo/cas/lib/casResultSheet';
import { sectionsForGrade } from '@pravyo/cas/lib/casSections';

/** The API's theme rows, turned into the step-wise sheet the PDF prints. */
function progressSheet(progress) {
  return subjectResultSheet({
    creditHours: progress.subject.creditHours ?? null,
    themes: progress.themes.map((theme) => ({
      ...theme,
      levels: theme.rows.map((row) => row.acceptedLevel),
    })),
  });
}

export default function StudentProgressPage() {
  const { school, academicYear, t } = useCas();
  const grades = school?.grades || [];
  // Filters are remembered until the page is refreshed.
  const [chosenGrade, setGrade] = useRememberedState('cas-progress:grade', '');
  const [subjectId, setSubject] = useRememberedState('cas-progress:subject', '');
  const [studentId, setStudent] = useRememberedState('cas-progress:student', '');
  const [chosenSection, setSection] = useRememberedState('cas-progress:section', '');
  const grade = (grades.includes(chosenGrade) && chosenGrade) || grades[0] || '';
  const sections = sectionsForGrade(school?.gradeSections, grade);
  const section = sections.includes(chosenSection) ? chosenSection : '';

  const curriculum = useCasQuery(
    grade ? `/api/cas/curriculum?grade=${encodeURIComponent(grade)}` : null,
  );
  const students = useCasQuery(
    grade && academicYear?.id
      ? `/api/cas/students?grade=${encodeURIComponent(grade)}&academicYear=${academicYear.id}${section ? `&section=${encodeURIComponent(section)}` : ''}`
      : null,
  );

  const subjects = curriculum.data || [];
  const roster = students.data || [];
  const subject = subjects.some((item) => item.id === subjectId)
    ? subjectId
    : subjects[0]?.id || '';
  const student = roster.some((item) => item.id === studentId)
    ? studentId
    : roster[0]?.id || '';
  const progressPath =
    academicYear?.id && grade && subject && student
      ? `/api/cas/progress?${new URLSearchParams({
          academicYear: academicYear.id,
          grade,
          subject,
          student,
        })}`
      : null;
  const progress = useCasQuery(progressPath);

  const loading = curriculum.loading || students.loading || progress.loading;
  // Grades 6-10 have no agreed result rule yet, so no sheet is computed.
  const resultAvailable = progress.data?.resultAvailable !== false;
  const sheet = progress.data && resultAvailable ? progressSheet(progress.data) : null;
  const error = curriculum.error || students.error || progress.error;

  function resetGrade(value) {
    setGrade(value);
    setSubject('');
    setStudent('');
    setSection('');
  }

  return (
    <>
      <PageHeader
        title={t('Student Progress', 'Student Progress')}
        description={t(
          "Follow one student subject by subject: each theme's continuous assessment adds up to the theme result, and the themes add up to the subject grade.",
          "Follow one student subject by subject: each theme's continuous assessment adds up to the theme result, and the themes add up to the subject grade.",
        )}
      />

      <Card>
        <div className="grid items-end gap-3 lg:grid-cols-4">
          <Field label={t('Grade', 'Grade')}>
            <Select value={grade} onChange={(event) => resetGrade(event.target.value)}>
              {grades.length === 0 && <option value="">No grades configured</option>}
              {grades.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </Field>

          {sections.length > 0 && <Field label={t('Section', 'सेक्सन')}>
            <Select value={section} onChange={(event) => { setSection(event.target.value); setStudent(''); }}>
              <option value="">{t('All sections', 'सबै सेक्सन')}</option>
              {sections.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>}

          <Field label={t('Student', 'Student')}>
            <Select
              value={student}
              disabled={!roster.length || students.loading}
              onChange={(event) => setStudent(event.target.value)}
            >
              {!roster.length && <option value="">Choose grade first</option>}
              {roster.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.rollNumber ? `${item.rollNumber} - ` : ''}{item.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('Subject', 'Subject')}>
            <Select
              value={subject}
              disabled={!subjects.length || curriculum.loading}
              onChange={(event) => setSubject(event.target.value)}
            >
              {!subjects.length && <option value="">Choose grade first</option>}
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.titleEn, item.titleNe)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-2">
          <LevelLegend />
        </div>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}
      {loading && <Spinner label={t('Loading student progress...', 'Loading student progress...')} />}

      {!loading && !error && !progress.data && (
        <Card>
          <EmptyState
            icon={FaChartLine}
            title={t('Choose a student and subject', 'Choose a student and subject')}
            description={t(
              'Progress appears after the grade has enrolled students and an active CAS curriculum.',
              'Progress appears after the grade has enrolled students and an active CAS curriculum.',
            )}
          />
        </Card>
      )}

      {!loading && !error && progress.data && (
        <>
          {progress.data.locked && (
            <Alert tone="warning">
              {t(
                'A published result exists for this student and year, so assessment rows are locked.',
                'A published result exists for this student and year, so assessment rows are locked.',
              )}
            </Alert>
          )}

          <Card
            title={progress.data.student.name}
            description={[
              progress.data.grade,
              progress.data.student.rollNumber ? `Roll ${progress.data.student.rollNumber}` : '',
              t(progress.data.subject.titleEn, progress.data.subject.titleNe),
              progress.data.year.label,
            ].filter(Boolean).join(' | ')}
          >
            {resultAvailable ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryMetric
                label={t('Obtained / full marks', 'Obtained / full marks')}
                value={`${sheet.obtained}/${sheet.fullMarks || '-'}`}
              />
              <SummaryMetric
                label={t('Subject percentage', 'Subject percentage')}
                value={formatPercent(sheet.percent)}
              />
              <SummaryMetric label={t('Final grade', 'Final grade')} value={sheet.grade || '-'} />
              <SummaryMetric
                label={t('Grade point', 'Grade point')}
                value={sheet.gradePoint == null ? '-' : sheet.gradePoint.toFixed(1)}
              />
              <SummaryMetric
                label={t('Outcomes assessed', 'Outcomes assessed')}
                value={`${progress.data.totals.assessedCount}/${progress.data.totals.outcomeCount}`}
              />
            </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryMetric
                  label={t('Obtained marks', 'Obtained marks')}
                  value={progress.data.totals.obtained}
                />
                <SummaryMetric
                  label={t('Outcomes assessed', 'Outcomes assessed')}
                  value={`${progress.data.totals.assessedCount}/${progress.data.totals.outcomeCount}`}
                />
              </div>
            )}
          </Card>

          {!resultAvailable && <Alert tone="info">{RESULT_SHEET_UNAVAILABLE}</Alert>}

          {resultAvailable && progress.data.themes.length > 0 && (
            <Card
              title={t('Theme-wise result', 'Theme-wise result')}
              description={t(
                'Updates as each continuous assessment is recorded. Unassessed outcomes are left out, not scored zero.',
                'Updates as each continuous assessment is recorded. Unassessed outcomes are left out, not scored zero.',
              )}
            >
              <div className="mb-3">
                <FormulaNote t={t} />
              </div>
              <ThemeCalculationTable sheet={sheet} t={t} />
            </Card>
          )}

          {progress.data.themes.length === 0 ? (
            <Card>
              <EmptyState
                icon={FaBookOpen}
                title={t('No themes assigned for this academic year', 'No themes assigned for this academic year')}
                description={t(
                  'Assign at least one theme to an exam in Curriculum.',
                  'Assign at least one theme to an exam in Curriculum.',
                )}
              />
            </Card>
          ) : (
            <>
              <h2 className="mb-2 font-semibold uppercase tracking-wide text-muted">
                {t('Continuous assessment by theme', 'Continuous assessment by theme')}
              </h2>
              {progress.data.themes.map((theme, index) => (
                <ThemeProgress key={theme.key} theme={theme} result={sheet?.themes[index]} t={t} />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

/** One theme's outcome-by-outcome record, folded under its result line. */
function ThemeProgress({ theme, result, t }) {
  const title = [theme.sequence ? `Theme ${theme.sequence}` : 'Theme', pickTitle(theme)]
    .filter(Boolean)
    .join(': ');
  const facts = [
    `${theme.assessedCount}/${theme.outcomeCount} outcomes assessed`,
    theme.workingHours != null ? `${theme.workingHours} working hours` : '',
    theme.pendingReassessment > 0 ? `${theme.pendingReassessment} need extra support` : '',
  ].filter(Boolean).join(' | ');
  return (
    <details className="card group mb-2 px-[var(--card-pad)] py-3">
      <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0">
          <span className="block font-semibold text-ink">
            <span className="mr-2 inline-block text-muted transition-colors group-open:rotate-90">&rsaquo;</span>
            {title}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{facts}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-ink">
            {result
              ? `${formatPercent(result.percent)}${result.grade ? ` · ${result.grade}` : ''}`
              : `Obtained ${theme.totals.obtained}`}
          </span>
          <Badge tone={theme.totals.complete ? 'success' : 'warning'}>
            {theme.totals.complete ? 'Complete' : 'In progress'}
          </Badge>
        </span>
      </summary>
      <div className="mt-3">
      <TableWrap minWidth="58rem">
        <thead>
          <tr>
            <Th>{t('S/N', 'S/N')}</Th>
            <Th>{t('Learning outcome', 'Learning outcome')}</Th>
            <Th>{t('Regular', 'Regular')}</Th>
            <Th>{t('Extra support', 'Extra support')}</Th>
            <Th>{t('Accepted', 'Accepted')}</Th>
            <Th>{t('Status', 'Status')}</Th>
          </tr>
        </thead>
        <tbody>
          {theme.rows.map((row) => (
            <tr key={row.outcome}>
              <Td label={t('S/N', 'S/N')} className="font-semibold text-muted">
                {row.serial}
              </Td>
              <Td label={t('Learning outcome', 'Learning outcome')}>
                <span className="font-semibold text-ink">
                  {row.titleEn || row.titleNe || row.code}
                </span>
                {row.assessmentAspect && (
                  <span className="mt-0.5 block text-xs text-muted">
                    {row.assessmentAspect.split('\n').filter(Boolean).join(', ')}
                  </span>
                )}
              </Td>
              <Td label={t('Regular', 'Regular')}>
                <AttemptCell level={row.regularLevel} date={row.regularDate} />
              </Td>
              <Td label={t('Extra support', 'Extra support')}>
                <AttemptCell level={row.remedialLevel} date={row.remedialDate} />
              </Td>
              <Td label={t('Accepted', 'Accepted')}>
                <LevelChip level={row.acceptedLevel} size="cas-level-sm" />
              </Td>
              <Td label={t('Status', 'Status')}>
                <ProgressStatus row={row} />
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      </div>
    </details>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <div className="card px-3 py-2.5">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function AttemptCell({ level, date }) {
  if (!level && !date) {
    return <span className="text-muted">-</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <LevelChip level={level} size="cas-level-sm" />
      <span className="text-xs text-muted">{date || '-'}</span>
    </span>
  );
}

function ProgressStatus({ row }) {
  if (row.acceptedLevel == null) return <Badge>Not assessed</Badge>;
  if (row.needsReassessment) return <Badge tone="warning">Needs support</Badge>;
  return <Badge tone="success">Achieved</Badge>;
}

function pickTitle(item) {
  return item.titleEn || item.titleNe || '';
}
