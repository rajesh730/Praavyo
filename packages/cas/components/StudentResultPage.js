'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import Link from 'next/link';
import { Calculator as FaCalculator, Download as FaDownload, Eye as FaEye, FileText as FaFileAlt, Send as FaPaperPlane, Printer as FaPrint, Search as FaSearch, Undo2 as FaUndo } from 'lucide-react';
import { hasAttendance, hasExtraActivities } from '@pravyo/core/casSupplementary';
import { DEFAULT_CAS_EXAM_TERM } from '@pravyo/core/casExamTerms';
import { useCas } from './CasLayout.js';
import { useCasQuery, useCasMutation } from '../lib/client/useCas.js';
import { downloadPdfFromPage } from '../lib/client/pdfDownload.js';
import {
  PageHeader, Card, Button, Field, Select, Alert, Spinner, EmptyState,
} from './ui/Kit.js';
import ReportCard, {
  REPORT_FORMATS,
  DEFAULT_REPORT_FORMAT,
} from './report/ReportCard.js';
import {
  FinalSummaryTable, ThemeCalculationTable, FormulaNote,
} from './result/ResultTables.js';
import { RESULT_SHEET_UNAVAILABLE } from '../lib/casResultSheet.js';
import { sectionsForGrade } from '../lib/casSections.js';

const FILTERS = [
  { key: 'all', en: 'All', ne: 'सबै' },
  { key: 'PUBLISHED', en: 'Published', ne: 'प्रकाशित' },
  { key: 'PREVIEW', en: 'Not published', ne: 'अप्रकाशित' },
  { key: 'NOT_ASSESSED', en: 'Not assessed', ne: 'मूल्याङ्कन भएन' },
];

/**
 * Student Result — every student's report card for a grade and academic year.
 *
 * Publish and Unpublish live only at the top and act on the ticked students, or
 * on everyone in view when none are ticked. Publishing sends each card to the
 * student and every guardian linked to them; unpublishing takes it back from
 * both. Each card offers only what concerns that one sheet: its calculation,
 * print and download.
 *
 * Every academic year stays here. Choosing an earlier year shows that year's
 * results exactly as they were published, including students who have since
 * been promoted, graduated or transferred.
 */
export default function StudentResultPage() {
  const { school, years, academicYear, setYearId, actor, lang, t } = useCas();
  const grades = school?.grades || [];
  const canPublish = actor?.role === 'SCHOOL_ADMIN';

  // Filters are remembered until the page is refreshed, so returning to this
  // screen shows the same result view.
  const [chosenGrade, setGrade] = useRememberedState('cas-result:grade', '');
  const [chosenSection, setSection] = useRememberedState('cas-result:section', '');
  const examTerm = DEFAULT_CAS_EXAM_TERM;
  const [examId, setExamId] = useRememberedState('cas-result:exam', '');
  const [chosenThemeAssignmentIds, setChosenThemeAssignmentIds] = useRememberedState('cas-result:themes', null);
  // CAS results are always Classic; the Modern card belongs to internal exams.
  const format = DEFAULT_REPORT_FORMAT;
  const [search, setSearch] = useRememberedState('cas-result:search', '');
  const [filter, setFilter] = useRememberedState('cas-result:status', 'all');
  const [selected, setSelected] = useState(new Set());
  const [workings, setWorkings] = useState(new Set());
  // Report cards are A4 sheets; rendering one per student made the list one
  // page tall per pupil. Each opens on demand, printing is unaffected.
  const [previews, setPreviews] = useState(new Set());
  const [downloading, setDownloading] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const grade = (grades.includes(chosenGrade) && chosenGrade) || grades[0] || '';
  const sections = sectionsForGrade(school?.gradeSections, grade);
  // Only live sections: one deleted on the dashboard stops filtering here.
  const section = sections.includes(chosenSection) ? chosenSection : '';
  const examsQuery = useCasQuery(academicYear?.id && grade
    ? `/api/cas/exams?${new URLSearchParams({ academicYear: academicYear.id, grade, includeArchived: 'true' })}` : null);
  const exams = examsQuery.data?.exams || [];
  const assignments = examsQuery.data?.assignments || [];
  const curriculumQuery = useCasQuery(grade ? `/api/cas/curriculum?grade=${encodeURIComponent(grade)}` : null);
  const subjects = curriculumQuery.data || [];
  const selectedExam = exams.find((item) => item.id === examId) || exams[0];
  const currentExamThemeAssignmentIds = assignments
    .filter((assignment) => assignment.exam === selectedExam?.id)
    .map((assignment) => assignment.id);
  // A result starts with, and displays, the themes assessed in the selected
  // exam only. Each terminal result is a separate, explicit report scope.
  // A remembered choice only keeps themes that still belong to this exam.
  const themeAssignmentIds = chosenThemeAssignmentIds
    ? chosenThemeAssignmentIds.filter((id) => currentExamThemeAssignmentIds.includes(id))
    : currentExamThemeAssignmentIds;
  // Keep the result scope explicit, but arrange its choices like the school
  // marksheet: subjects are columns and themes are rows. A subject can have
  // more than one assessment for a theme, so a cell retains every match.
  const themeSelections = assignments
    .filter((assignment) => assignment.exam === selectedExam?.id)
    .map((assignment) => {
      const subject = subjects.find((row) => row.id === assignment.subject);
      const theme = subject?.themes?.find((row) => row.key === assignment.themeKey);
      const sourceExam = exams.find((exam) => exam.id === assignment.exam);
      return {
        assignment,
        subject,
        theme,
        sourceExam,
        themeName: theme?.titleEn || theme?.titleNe || assignment.themeKey,
        sequence: Number(theme?.sequence) || Number.MAX_SAFE_INTEGER,
      };
    });
  const matrixSubjects = subjects.filter((subject) =>
    themeSelections.some((selection) => selection.assignment.subject === subject.id));
  const themeRowsByKey = new Map();
  themeSelections.forEach((selection) => {
    // Theme titles can differ by subject (for example English Theme 1 and
    // Nepali Theme 1), but their sequence is the shared row teachers use.
    const key = String(selection.sequence);
    if (!themeRowsByKey.has(key)) {
      themeRowsByKey.set(key, {
        key,
        sequence: selection.sequence,
        themeKey: selection.assignment.themeKey,
        selectionsBySubject: new Map(),
      });
    }
    const row = themeRowsByKey.get(key);
    const subjectSelections = row.selectionsBySubject.get(selection.assignment.subject) || [];
    subjectSelections.push(selection);
    row.selectionsBySubject.set(selection.assignment.subject, subjectSelections);
  });
  const themeRows = [...themeRowsByKey.values()].sort((left, right) =>
    left.sequence - right.sequence || left.themeKey.localeCompare(right.themeKey));
  const resultMode = 'EXAM';
  const includePrevious = false;
  const cardsPath = academicYear?.id && grade && !examsQuery.loading && selectedExam && themeAssignmentIds.length
    ? `/api/cas/results/cards?${new URLSearchParams({
        academicYear: academicYear.id,
        grade,
        ...(section ? { section } : {}),
        format,
        examTerm,
        resultMode,
        examId: selectedExam.id,
        includePrevious,
        themeAssignmentIds: themeAssignmentIds.join(','),
      })}`
    : null;
  const { data, loading, error: loadError, reload } = useCasQuery(cardsPath);
  const { run, pending, error, success, setSuccess } = useCasMutation();

  const students = data?.students || [];
  const counts = Object.fromEntries(FILTERS.map((item) => [
    item.key,
    item.key === 'all' ? students.length : students.filter((s) => s.status === item.key).length,
  ]));
  const query = search.trim().toLowerCase();
  const visible = students.filter((student) =>
    (filter === 'all' || student.status === filter) &&
    (!query || student.name.toLowerCase().includes(query) || String(student.rollNumber) === query));
  const visibleCards = visible.filter((student) => student.report);
  const chosen = visibleCards.filter((student) => selected.has(student.id));
  // Actions apply to the ticked students, or to everyone in view.
  const scope = chosen.length ? chosen : visibleCards;
  const toPublish = scope.filter((student) => student.status === 'PREVIEW');
  const toUnpublish = scope.filter((student) => student.status === 'PUBLISHED');
  const missingRecords = visibleCards.filter(missesRecords);
  const missingCredits = (students.find((s) => s.report)?.report.snapshot.subjects || [])
    .filter((subject) => subject.creditHours == null);

  function resetView() {
    setSelected(new Set());
    setWorkings(new Set());
    setPreviews(new Set());
    setOutcome(null);
  }

  function changeExam(value) {
    setExamId(value);
    setChosenThemeAssignmentIds(null);
    resetView();
  }

  function toggleResultTheme(assignmentId) {
    const next = new Set(themeAssignmentIds);
    if (next.has(assignmentId)) next.delete(assignmentId);
    else next.add(assignmentId);
    setChosenThemeAssignmentIds([...next]);
    resetView();
  }

  function printUrl(ids, print) {
    const params = new URLSearchParams({
      academicYear: academicYear?.id || '',
      grade,
      ...(section ? { section } : {}),
      format,
      lang,
      examTerm,
      resultMode,
      ...(resultMode === 'EXAM' && selectedExam ? { examId: selectedExam.id } : {}),
      includePrevious,
      themeAssignmentIds: themeAssignmentIds.join(','),
      ...(ids.length ? { students: ids.join(',') } : {}),
      ...(print ? { print: '1' } : {}),
    });
    return `/school/cas/print/results?${params}`;
  }

  /** Print opens the cards with the print dialog; download saves a PDF file. */
  async function openPrint(targets, download, key) {
    const missing = targets.filter(missesRecords);
    if (missing.length && !window.confirm(
      `Attendance or extra activities have not been filled in for ${missing.length} student` +
      `${missing.length === 1 ? '' : 's'}:\n${listNames(missing)}\n\n` +
      'Those sections will be left off their report cards. Fill them in on the Assessment ' +
      'screen first, or press OK to continue without them.',
    )) return;
    const everyone = targets.length === students.filter((s) => s.report).length;
    const ids = everyone ? [] : targets.map((s) => s.id);
    if (!download) {
      window.open(printUrl(ids, true), '_blank', 'noopener');
      return;
    }
    setDownloading(key);
    try {
      await downloadPdfFromPage(printUrl(ids, false));
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDownloading('');
    }
  }

  async function publish() {
    if (!toPublish.length || !academicYear?.id) return;
    setConfirmingPublish(false);
    setOutcome(null);
    const result = await run('/api/cas/results/publish', {
      method: 'POST',
      body: {
        academicYear: academicYear.id,
        grade,
        ...(section ? { section } : {}),
        students: toPublish.map((student) => student.id),
        format,
        examTerm,
        resultMode,
        ...(resultMode === 'EXAM' && selectedExam ? { examId: selectedExam.id } : {}),
        includePrevious,
        themeAssignmentIds,
      },
    });
    if (result.ok) {
      const { published = [], failed = [], skipped = [] } = result.data || {};
      setSuccess(`${published.length} result${published.length === 1 ? '' : 's'} published and sent to students and parents.`);
      setOutcome({ failed, skipped });
      setSelected(new Set());
      reload();
    }
  }

  async function unpublish() {
    if (!toUnpublish.length || !academicYear?.id) return;
    if (!window.confirm(
      `Unpublish the result of ${describe(toUnpublish)}?\n\n` +
      'Students and parents will no longer see it, and its assessments unlock so they can be corrected. ' +
      'You can publish it again afterwards.',
    )) return;
    setOutcome(null);
    const result = await run('/api/cas/results/unpublish', {
      method: 'POST',
      body: {
        academicYear: academicYear.id,
        grade,
        ...(section ? { section } : {}),
        examTerm,
        resultMode,
        ...(resultMode === 'EXAM' && selectedExam ? { examId: selectedExam.id } : {}),
        includePrevious,
        themeAssignmentIds,
        students: toUnpublish.map((student) => student.id),
      },
    });
    if (result.ok) {
      const count = result.data?.unpublished ?? 0;
      setSuccess(`${count} result${count === 1 ? '' : 's'} unpublished. Students and parents no longer see ${count === 1 ? 'it' : 'them'}.`);
      setSelected(new Set());
      reload();
    }
  }

  function toggle(set, setter, id) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const scopeLabel = chosen.length
    ? t(`${chosen.length} selected`, `${chosen.length} छानिएका`)
    : visibleCards.length === students.filter((s) => s.report).length
      ? t('all', 'सबै')
      : t(`${visibleCards.length} shown`, `देखिएका ${visibleCards.length}`);

  return (
    <>
      <PageHeader
        title={t('Student Result', 'विद्यार्थी नतिजा')}
        description={t(
          'Report cards for every student, calculated from continuous assessment. Publishing sends each card to the student and their parents.',
          'निरन्तर मूल्याङ्कनबाट तयार हरेक विद्यार्थीको नतिजा पत्र। प्रकाशित गर्दा विद्यार्थी र अभिभावकले देख्छन्।',
        )}
        actions={
          canPublish && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={pending || toUnpublish.length === 0} onClick={unpublish}>
                <FaUndo className="text-xs" />
                {t(`Unpublish (${toUnpublish.length})`, `अप्रकाशित (${toUnpublish.length})`)}
              </Button>
              <Button disabled={pending || toPublish.length === 0} onClick={() => setConfirmingPublish(true)}>
                <FaPaperPlane className="text-xs" />
                {pending
                  ? t('Working...', 'हुँदैछ...')
                  : t(`Publish result (${toPublish.length})`, `नतिजा प्रकाशित (${toPublish.length})`)}
              </Button>
            </div>
          )
        }
      />

      {confirmingPublish && (
        <PublishConfirmDialog
          t={t}
          students={toPublish}
          grade={grade}
          section={section}
          examName={selectedExam?.name}
          formatLabel={REPORT_FORMATS.find((option) => option.value === format)?.label || format}
          missingRecords={toPublish.filter(missesRecords).length}
          onCancel={() => setConfirmingPublish(false)}
          onConfirm={publish}
        />
      )}

      <Card>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          <Field label={t('Academic year', 'शैक्षिक वर्ष')}>
            <Select
              value={academicYear?.id || ''}
              onChange={(event) => { setYearId(event.target.value); setSection(''); setExamId(''); setChosenThemeAssignmentIds(null); resetView(); }}
            >
              {(years || []).map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}{year.status === 'ACTIVE' ? '' : ` (${t('past', 'विगत')})`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Grade', 'कक्षा')}>
            <Select value={grade} onChange={(event) => { setGrade(event.target.value); setSection(''); setExamId(''); setChosenThemeAssignmentIds(null); resetView(); }}>
              {grades.length === 0 && <option value="">No grades configured</option>}
              {grades.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label={t('Section', 'सेक्सन')}>
            <Select value={section} disabled={sections.length === 0} onChange={(event) => { setSection(event.target.value); resetView(); }}>
              <option value="">{sections.length ? t('All sections', 'सबै सेक्सन') : t('No sections configured', 'सेक्सन तय गरिएको छैन')}</option>
              {sections.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </Field>
          <Field label={t('Exam result', 'परीक्षा नतिजा')}>
            <Select value={selectedExam?.id || ''} onChange={(event) => changeExam(event.target.value)}>
              {!exams.length && <option value="">No exams configured</option>}
              {exams.map((option) => <option key={option.id} value={option.id}>{option.name}{option.status === 'ARCHIVED' ? ` (${t('Archived', 'संग्रहित')})` : ''}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {false && <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="secondary" disabled={!academicYear?.id || !grade} onClick={() => setShowPublished((value) => !value)}>
          <FaFileAlt className="text-xs" />
          {showPublished
            ? t('Hide published results', 'प्रकाशित नतिजा लुकाउनुहोस्')
            : t('Show published results', 'प्रकाशित नतिजा देखाउनुहोस्')}
        </Button>
        {showPublished && (publishedHistoryQuery.loading
          ? <span className="text-sm text-muted">{t('Loading...', 'लोड हुँदैछ...')}</span>
          : publishedHistory.length === 0
            ? <span className="text-sm text-muted">{t('No published results yet.', 'नतिजा अझै प्रकाशित भएको छैन।')}</span>
            : historyGroups(publishedHistory).map((group) => (
              <Link
                key={group.key}
                href={`/school/cas/print/published?${new URLSearchParams({ ids: group.reports.map((report) => report.id).join(','), lang })}`}
                target="_blank"
                className="text-sm font-semibold text-brand hover:underline"
              >
                {group.title} ({group.reports.length})
              </Link>
            )))}
      </div>}

      <Card
        title={t('Themes in this result', 'यस नतिजामा समावेश हुने थिमहरू')}
        description={t(
          'Only themes assessed in the selected exam are included in this report.',
          'छानिएको परीक्षामा मूल्याङ्कन भएका थिमहरू मात्र यस नतिजामा समावेश हुन्छन्।',
        )}
      >
        {examsQuery.loading || curriculumQuery.loading ? <Spinner label={t('Loading themes...', 'थिमहरू लोड हुँदैछ...')} />
          : themeSelections.length === 0 ? <EmptyState icon={FaFileAlt} title={t('No assessed themes are available', 'मूल्याङ्कनका लागि कुनै थिम छैन')} description={t('Assign themes to an exam in Manage Exams first.', 'पहिले परीक्षा व्यवस्थापनमा थिम तोक्नुहोस्।')} />
            : (
              <div className="card overflow-x-auto" tabIndex={0} aria-label={t('Theme selection table', 'थिम छनोट तालिका')}>
                <table className="min-w-[760px] w-full table-fixed border-collapse text-left">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="w-28 border-b border-r border-line px-3 py-2 font-semibold">{t('Theme', 'थिम')}</th>
                      {matrixSubjects.map((subject) => (
                        <th key={subject.id} scope="col" className="border-b border-line px-3 py-2 font-semibold">
                          {subject.titleEn || subject.titleNe || t('Subject', 'विषय')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {themeRows.map((row) => (
                      <tr key={row.key} className="align-top">
                        <th scope="row" className="border-b border-r border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
                          {row.sequence === Number.MAX_SAFE_INTEGER ? row.themeKey : `${t('Theme', 'थिम')} ${row.sequence}`}
                        </th>
                        {matrixSubjects.map((subject) => {
                          const selections = row.selectionsBySubject.get(subject.id) || [];
                          return (
                            <td key={subject.id} className="border-b border-line p-0">
                              {selections.length === 0 ? (
                                <span className="block px-3 py-2.5 text-sm text-muted">{t('Not available', 'उपलब्ध छैन')}</span>
                              ) : selections.map(({ assignment, sourceExam, themeName }) => {
                                const checked = themeAssignmentIds.includes(assignment.id);
                                const current = assignment.exam === selectedExam?.id;
                                return (
                                  <label key={assignment.id} className="flex cursor-pointer items-start gap-2 px-3 py-3 hover:bg-surface-2">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                                      checked={checked}
                                      onChange={() => toggleResultTheme(assignment.id)}
                                      aria-label={`${checked ? 'Remove' : 'Include'} ${themeName} for ${subject.titleEn || subject.titleNe || 'subject'}`}
                                    />
                                    <span className="min-w-0">
                                      <span className="block break-words text-sm font-medium text-ink">{themeName}</span>
                                      <span className="mt-0.5 block text-xs text-muted">
                                        {current ? t('Assessed in this exam', 'यस परीक्षामा मूल्याङ्कन') : t(`Assessed in ${sourceExam?.name || 'another exam'}`, `${sourceExam?.name || 'अर्को परीक्षा'} मा मूल्याङ्कन`) }
                                      </span>
                                      <span className={`badge badge-neutral mt-2 inline-flex text-xs font-semibold ${checked ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted'}`}>
                                        {checked ? t('Included', 'समावेश') : t('Not included', 'समावेश छैन')}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        {!themeAssignmentIds.length && !examsQuery.loading && (
          <Alert tone="warning">{t('Select at least one theme before preparing a result.', 'नतिजा तयार गर्न कम्तीमा एउटा थिम छान्नुहोस्।')}</Alert>
        )}
      </Card>

      {(loadError || error) && <Alert tone="danger">{loadError || error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}
      {outcome && (outcome.skipped.length > 0 || outcome.failed.length > 0) && (
        <Alert tone="warning">
          <p className="font-semibold">{t('Not published', 'प्रकाशित भएन')}:</p>
          <ul className="mt-1 list-disc pl-5">
            {[...outcome.skipped, ...outcome.failed].map((item, index) => (
              <li key={index}>
                {item.name || nameOf(students, item.student) || t('A result', 'एउटा नतिजा')}: {item.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {missingRecords.length > 0 && (
        <Alert tone="warning">
          {t(
            `Attendance or extra activities are missing for ${missingRecords.length} student${missingRecords.length === 1 ? '' : 's'}: ${listNames(missingRecords, ', ')}. Those sections are left off their report cards until they are filled in on the Assessment screen.`,
            `${missingRecords.length} विद्यार्थीको हाजिरी वा अतिरिक्त क्रियाकलाप भरिएको छैन: ${listNames(missingRecords, ', ')}। मूल्याङ्कन पृष्ठमा नभरेसम्म ती खण्ड नतिजा पत्रमा देखिँदैनन्।`,
          )}
        </Alert>
      )}
      {missingCredits.length > 0 && (
        <Alert tone="warning">
          {missingCredits.map((subject) => t(subject.titleEn, subject.titleNe)).join(', ')}{' '}
          {t(
            'has no credit hours, so it is left out of the GPA. Set credit hours on the subject in Curriculum.',
            'को क्रेडिट घण्टा छैन, त्यसैले GPA मा गनिँदैन। पाठ्यक्रममा क्रेडिट घण्टा राख्नुहोस्।',
          )}
        </Alert>
      )}

      {loading ? (
        <Card><Spinner label={t('Preparing report cards...', 'नतिजा पत्र तयार हुँदै...')} /></Card>
      ) : data?.resultAvailable === false ? (
        <Card>
          <EmptyState
            icon={FaFileAlt}
            title={t(`Results for ${grade} are not set up yet`, `${grade} को नतिजा अझै तयार छैन`)}
            description={RESULT_SHEET_UNAVAILABLE}
          />
        </Card>
      ) : students.length === 0 ? (
        <Card>
          <EmptyState
            icon={FaFileAlt}
            title={t(`No students in ${grade} for ${academicYear?.label || 'this year'}`, `${academicYear?.label || 'यो वर्ष'} मा ${grade} मा विद्यार्थी छैनन्`)}
            description={t(
              'Students come from the Praavyo Students list. Register them there and enrol them in this grade and academic year.',
              'विद्यार्थी Pravyo को विद्यार्थी सूचीबाट आउँछन्। त्यहाँ दर्ता गरी यो कक्षा र शैक्षिक वर्षमा भर्ना गर्नुहोस्।',
            )}
          />
        </Card>
      ) : (
        <>
          <div className="cas-results-toolbar">
            <div className="cas-results-tabs" role="tablist" aria-label={t('Filter by status', 'अवस्था अनुसार')}>
              {FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.key}
                  className="cas-results-tab"
                  onClick={() => { setFilter(item.key); setSelected(new Set()); }}
                >
                  {t(item.en, item.ne)} <span>{counts[item.key]}</span>
                </button>
              ))}
            </div>
            <label className="cas-results-search">
              <FaSearch aria-hidden="true" />
              <input
                type="search"
                value={search}
                placeholder={t('Search by name or roll', 'नाम वा रोलले खोज्नुहोस्')}
                onChange={(event) => { setSearch(event.target.value); setSelected(new Set()); }}
              />
            </label>
          </div>

          <div className="cas-results-bar">
            <label className="flex items-center gap-2 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand-primary)]"
                disabled={visibleCards.length === 0}
                checked={visibleCards.length > 0 && chosen.length === visibleCards.length}
                onChange={(event) =>
                  setSelected(event.target.checked ? new Set(visibleCards.map((s) => s.id)) : new Set())
                }
              />
              {chosen.length
                ? t(`${chosen.length} selected`, `${chosen.length} छानिएका`)
                : t('Select all', 'सबै छान्नुहोस्')}
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" disabled={scope.length === 0} onClick={() => openPrint(scope, false)}>
                <FaPrint className="text-xs" /> {t(`Print ${scopeLabel}`, `${scopeLabel} प्रिन्ट`)}
              </Button>
              <Button variant="secondary" disabled={scope.length === 0 || Boolean(downloading)} onClick={() => openPrint(scope, true, 'scope')}>
                <FaDownload className="text-xs" />
                {downloading === 'scope'
                  ? t('Preparing PDF...', 'PDF तयार हुँदैछ...')
                  : t(`Download ${scopeLabel} (PDF)`, `${scopeLabel} PDF डाउनलोड`)}
              </Button>
            </div>
          </div>

          {visible.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm text-muted">
                {t('No student matches this search.', 'यो खोजसँग मिल्ने विद्यार्थी छैनन्।')}
              </p>
            </Card>
          ) : (
            <div className="grid gap-2">
              {visible.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  lang={lang}
                  t={t}
                  selected={selected.has(student.id)}
                  onSelect={() => toggle(selected, setSelected, student.id)}
                  showWorking={workings.has(student.id)}
                  onToggleWorking={() => toggle(workings, setWorkings, student.id)}
                  showCard={previews.has(student.id)}
                  onToggleCard={() => toggle(previews, setPreviews, student.id)}
                  downloading={downloading === student.id}
                  downloadBusy={Boolean(downloading)}
                  onPrint={(download) => openPrint([student], download, student.id)}
                  format={format}
                />
              ))}
            </div>
          )}
        </>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted">
        {t(
          'Download saves the report cards as a PDF file. Earlier academic years stay available here; choose the year above to see its results.',
          'डाउनलोडले नतिजा पत्र PDF फाइलमा सेभ गर्छ। अघिल्ला शैक्षिक वर्षका नतिजा माथि वर्ष छानेर हेर्न सकिन्छ।',
        )}
      </p>
    </>
  );
}

/** One student: who they are and where their result stands, above their card. */
function StudentCard({ student, lang, t, selected, onSelect, showWorking, onToggleWorking, showCard, onToggleCard, downloading, downloadBusy, onPrint, format }) {
  const { report } = student;
  return (
    <section className={`cas-result-card ${selected ? 'is-selected' : ''}`} aria-label={student.name}>
      <header className="cas-result-card-head">
        {report ? (
          <input
            type="checkbox"
            className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
            aria-label={`Select ${student.name}`}
            checked={selected}
            onChange={onSelect}
          />
        ) : <span className="w-4 shrink-0" />}
        <span className="cas-result-avatar" aria-hidden="true">{initials(student.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{student.name}</p>
          <p className="text-xs text-muted">
            {t('Roll', 'रोल')} {student.rollNumber || '-'}
            {report?.snapshot?.gpa != null && <> · GPA {report.snapshot.gpa} ({report.snapshot.overallGrade})</>}
          </p>
        </div>
        <ResultStatus student={student} t={t} />
        {report && (
          <div className="cas-result-actions">
            <button type="button" aria-pressed={showCard} aria-expanded={showCard} onClick={onToggleCard} title={t('Show the report card', 'नतिजा पत्र हेर्नुहोस्')}>
              <FaEye aria-hidden="true" /><span>{t('Report card', 'नतिजा पत्र')}</span>
            </button>
            <button type="button" aria-pressed={showWorking} onClick={onToggleWorking} title={t('Show the calculation', 'हिसाब हेर्नुहोस्')}>
              <FaCalculator aria-hidden="true" /><span>{t('Calculation', 'हिसाब')}</span>
            </button>
            <button type="button" onClick={() => onPrint(false)} title={t('Print this card', 'यो नतिजा पत्र प्रिन्ट')}>
              <FaPrint aria-hidden="true" /><span>{t('Print', 'प्रिन्ट')}</span>
            </button>
            <button type="button" disabled={downloadBusy} onClick={() => onPrint(true)} title={t('Download this card as PDF', 'PDF डाउनलोड')}>
              <FaDownload aria-hidden="true" /><span>{downloading ? t('Preparing...', 'तयार हुँदैछ...') : t('Download', 'डाउनलोड')}</span>
            </button>
          </div>
        )}
      </header>

      {report ? (
        <>
          {showWorking && (
            <div className="border-b border-line bg-surface p-3 sm:p-4">
              <StudentBreakdown snapshot={report.snapshot} name={student.name} t={t} />
            </div>
          )}
          {showCard && (
            <div className="cas-result-card-sheet">
              {/* The chosen format, published or not: both layouts read the
                  same snapshot, so this never changes the stored result. */}
              <ReportCard report={report} lang={lang} format={format} />
            </div>
          )}
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-muted">
          {t(
            'Nothing has been assessed for this student yet, so there is no report card.',
            'यो विद्यार्थीको अझै मूल्याङ्कन भएको छैन, त्यसैले नतिजा पत्र छैन।',
          )}
        </p>
      )}
    </section>
  );
}

/** The whole worked calculation for one student: each subject, then the GPA. */
function StudentBreakdown({ snapshot, name, t }) {
  const subjects = snapshot.subjects || [];
  return (
    <div className="grid gap-4">
      <FormulaNote t={t} />
      {subjects.map((subject, index) => (
        <section key={subject.subjectCode || index}>
          <h3 className="mb-2 font-semibold text-ink">
            {index + 1}. {t(subject.titleEn, subject.titleNe)}
          </h3>
          {(subject.themes || []).length === 0 ? (
            <p className="text-sm text-muted">
              {t('No theme of this subject is assigned to this result.', 'यस नतिजाका लागि यस विषयको कुनै थिम तोकिएको छैन।')}
            </p>
          ) : (
            <ThemeCalculationTable sheet={sheetOf(subject)} t={t} />
          )}
        </section>
      ))}
      <section>
        <h3 className="mb-2 font-semibold text-ink">
          {subjects.length + 1}. {t('Final result summary', 'अन्तिम नतिजा सारांश')}
        </h3>
        <FinalSummaryTable result={snapshot} studentName={name} t={t} />
      </section>
    </div>
  );
}

/** A report subject carries the sheet's fields under report names. */
function sheetOf(subject) {
  return {
    themes: subject.themes,
    assessments: subject.assessedCount,
    fullMarks: subject.fullMarks,
    obtained: subject.obtained,
    percent: subject.achievement,
    grade: subject.grade,
    gradePoint: subject.gradePoint,
  };
}

function ResultStatus({ student, t }) {
  const { status } = student;
  const [tone, label] = status === 'PUBLISHED'
    ? ['published', t('Published', 'प्रकाशित')]
    : status === 'NOT_ASSESSED'
      ? ['empty', t('Not assessed', 'मूल्याङ्कन भएन')]
      : ['draft', student.fullyAssessed
        ? t('Not published', 'अप्रकाशित')
        : t(`Not published · ${student.coverage}% assessed`, `अप्रकाशित · ${student.coverage}% मूल्याङ्कन`)];
  return <span className={`cas-result-status is-${tone}`}>{label}</span>;
}

/** A card whose attendance or extra activities the school has not filled in. */
/**
 * Published cards grouped by the title printed on them. Read from the stored
 * snapshot, so a group survives its exam being archived or renamed.
 */
function historyGroups(reports) {
  const groups = new Map();
  reports.forEach((report) => {
    const title = report.snapshot?.examTitle || report.snapshot?.examTerm || report.examTerm || 'Published result';
    if (!groups.has(title)) groups.set(title, { key: title, title, reports: [] });
    groups.get(title).reports.push(report);
  });
  return [...groups.values()];
}

/**
 * The last check before results reach families. A browser confirm() was one
 * reflexive click away from publishing the wrong exam or grade; this spells out
 * exactly what goes out and needs a deliberate tick first.
 */
function PublishConfirmDialog({ t, students, grade, section, examName, formatLabel, missingRecords, onCancel, onConfirm }) {
  const [checked, setChecked] = useState(false);
  const rows = [
    [t('Grade', 'कक्षा'), section ? `${grade} · ${t('Section', 'सेक्सन')} ${section}` : grade],
    [t('Exam', 'परीक्षा'), examName || '—'],
    [t('Format', 'ढाँचा'), formatLabel],
    [t('Students', 'विद्यार्थी'), String(students.length)],
  ];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="publish-confirm-title">
      <div className="modal-panel">
        <h2 id="publish-confirm-title" className="text-lg font-semibold text-ink">
          {t('Publish these results?', 'यी नतिजा प्रकाशित गर्ने?')}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t(
            'Each report card is sent to the student and every linked parent straight away. It stays locked until you unpublish it.',
            'हरेक नतिजा पत्र तुरुन्तै विद्यार्थी र अभिभावकलाई पठाइन्छ। अप्रकाशित नगरेसम्म यो लक रहन्छ।',
          )}
        </p>

        <dl className="mt-4 divide-y divide-line rounded-control border border-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs text-muted">{listNames(students, ', ')}</p>

        {missingRecords > 0 && (
          <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
            {t(
              `${missingRecords} of these card${missingRecords === 1 ? ' has' : 's have'} no attendance or extra activities filled in.`,
              `${missingRecords} नतिजा पत्रमा हाजिरी वा अतिरिक्त क्रियाकलाप भरिएको छैन।`,
            )}
          </p>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" className="mt-0.5" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
          {t('I have checked these results and they are correct.', 'मैले यी नतिजा जाँचेँ र सही छन्।')}
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel', 'रद्द गर्नुहोस्')}</Button>
          <Button disabled={!checked} onClick={onConfirm}>
            <FaPaperPlane className="text-xs" />
            {t(`Publish ${students.length} result${students.length === 1 ? '' : 's'}`, `${students.length} नतिजा प्रकाशित गर्नुहोस्`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function missesRecords(student) {
  const snapshot = student.report?.snapshot || {};
  return !hasAttendance(snapshot.attendance) || !hasExtraActivities(snapshot.extraActivities);
}

function describe(targets) {
  return targets.length === 1 ? targets[0].name : `${targets.length} students`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function listNames(students, separator = '\n') {
  const names = students.slice(0, 10).map((student) => student.name);
  if (students.length > 10) names.push(`and ${students.length - 10} more`);
  return names.join(separator);
}

function nameOf(students, id) {
  return students.find((student) => student.id === id)?.name;
}
