'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck as FaCalendarCheck, CheckCheck as FaCheckAll, List as FaListUl, Save as FaSave } from 'lucide-react';
import { ECA_FIELDS, emptyAttendance, normalizeAttendance } from '@pravyo/core/casSupplementary';
import { useCasQuery, useCasMutation } from '../lib/client/useCas.js';
import { sectionsForGrade } from '../lib/casSections.js';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  TableWrap,
  Td,
  Th,
} from './ui/Kit.js';

function parseCount(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function countValue(value) {
  return value == null ? '' : String(value);
}

function makeDraft(table) {
  return Object.fromEntries(
    (table?.students || []).map((row) => [
      row.student.id,
      {
        revision: row.revision ?? 0,
        attendance: normalizeAttendance(row.attendance),
        extraActivities: { ...(row.extraActivities || {}) },
      },
    ]),
  );
}

/** Extra activities are entered once per exam; a saved row is read-only. */
function hasActivities(values) {
  return ECA_FIELDS.some((field) => String(values?.[field.key] || '').trim());
}

const WHOLE_YEAR = 'YEAR';

/** The exam being worked on now: the newest active one (exams come oldest first). */
function defaultExam(exams) {
  const active = exams.filter((item) => item.status !== 'ARCHIVED');
  return (active.length ? active : exams).at(-1)?.id || '';
}

export default function StudentSupplementaryAssessment({
  mode,
  grade,
  setGrade,
  grades,
  gradeSections,
  academicYear,
  exam: chosenExam,
  setExam,
  section,
  setSection,
  t,
}) {
  const academicYearId = academicYear?.id;
  const examsQuery = useCasQuery(
    grade && academicYearId
      ? `/api/cas/exams?${new URLSearchParams({ academicYear: academicYearId, grade, includeArchived: 'true' })}`
      : null,
  );
  const exams = examsQuery.data?.exams || [];
  // A choice from another grade or a deleted exam falls back to the current
  // exam, so its saved figures show without re-picking.
  // YEAR = the whole-year (merged) result, else an exam id.
  const exam = chosenExam === WHOLE_YEAR || exams.some((item) => item.id === chosenExam)
    ? chosenExam
    : defaultExam(exams);
  const sections = sectionsForGrade(gradeSections, grade);
  // Only live sections: one deleted on the dashboard stops filtering here.
  const selectedSection = section && sections.includes(section) ? section : '';
  const query = useMemo(() => {
    if (!grade || !academicYearId || !exam) return null;
    const params = new URLSearchParams({ academicYear: academicYearId, grade });
    if (selectedSection) params.set('section', selectedSection);
    if (exam !== WHOLE_YEAR) params.set('exam', exam);
    return `/api/cas/student-records?${params}`;
  }, [academicYearId, grade, selectedSection, exam]);
  const tableQuery = useCasQuery(query);
  const table = tableQuery.data;

  return (
    <>
      <Card>
        <fieldset className="grid min-w-0 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('Grade', 'Grade')}>
            <Select
              value={grade}
              onChange={(event) => {
                setGrade(event.target.value);
                setSection('');
                setExam('');
              }}
            >
              <option value="">{t('Choose grade', 'Choose grade')}</option>
              {grades.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('Exam', 'परीक्षा')}>
            <Select
              value={exam}
              disabled={!grade || examsQuery.loading}
              onChange={(event) => setExam(event.target.value)}
            >
              {!exams.length && <option value="">{t('Choose exam', 'परीक्षा छान्नुहोस्')}</option>}
              {exams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.publishedAt != null ? ` (${t('result published', 'नतिजा प्रकाशित')})` : ''}
                </option>
              ))}
              <option value={WHOLE_YEAR}>{t('Whole year (final result)', 'पूरा वर्ष (अन्तिम नतिजा)')}</option>
            </Select>
          </Field>
          {/* Always shown, so every grade gets the same filter row. */}
          <Field label={t('Section', 'सेक्सन')}>
            <Select
              value={selectedSection}
              disabled={!grade || !sections.length || tableQuery.loading}
              onChange={(event) => setSection(event.target.value)}
            >
              <option value="">{sections.length ? t('All sections', 'सबै सेक्सन') : t('No sections', 'सेक्सन छैन')}</option>
              {sections.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
      </Card>

      {tableQuery.error && <Alert tone="danger">{tableQuery.error}</Alert>}
      {tableQuery.loading && <Spinner />}

      {!grade && (
        <Card>
          <EmptyState
            icon={FaListUl}
            title={t('Choose a grade', 'Choose a grade')}
            description={t(
              'Attendance and extra activities are recorded per student.',
              'Attendance and extra activities are recorded per student.',
            )}
          />
        </Card>
      )}

      {grade && !exam && !examsQuery.loading && (
        <Card>
          <EmptyState
            icon={FaCalendarCheck}
            title={t('No exams for this grade yet', 'यो कक्षाको परीक्षा छैन')}
            description={t(
              'Create an exam in Curriculum. Each exam has its own working days and present days, printed on that exam\'s report card.',
              'Curriculum मा परीक्षा बनाउनुहोस्। हरेक परीक्षाको आफ्नै कार्य दिन र उपस्थित दिन हुन्छ, जुन सोही परीक्षाको नतिजा पत्रमा छापिन्छ।',
            )}
          />
        </Card>
      )}

      {grade && exam && table && table.students.length === 0 && (
        <Card>
          <EmptyState
            icon={FaListUl}
            title={t('No students found', 'No students found')}
            description={t('Try another grade or section.', 'Try another grade or section.')}
          />
        </Card>
      )}

      {exam && table && table.students.length > 0 && (
        <StudentRecordsTable
          key={`${mode}:${query}`}
          mode={mode}
          table={table}
          academicYear={academicYear}
          onSaved={tableQuery.setData}
          t={t}
        />
      )}
    </>
  );
}

function StudentRecordsTable({ mode, table, academicYear, onSaved, t }) {
  const { run, pending, error, success, setError, setSuccess } = useCasMutation();
  const [draft, setDraft] = useState(() => makeDraft(table));
  const [classWorkingDays, setClassWorkingDays] = useState(() => commonWorkingDays(table));
  const rows = table.students || [];
  const canEdit = table.canRecord && !pending;
  const activitiesSaved = (row) => mode !== 'attendance' && hasActivities(row.extraActivities);
  const editableRows = rows.filter((row) => !row.locked && !activitiesSaved(row));
  const original = useMemo(() => makeDraft(table), [table]);
  const workingDays = parseCount(classWorkingDays);

  /**
   * What is saved for a student. On the attendance tab working days come from
   * the one class figure and absent days are worked out; a student with no
   * present days typed has no attendance yet.
   */
  function submittedAttendance(studentId) {
    const attendance = normalizeAttendance(draft[studentId]?.attendance);
    if (mode !== 'attendance') return attendance;
    if (attendance.presentDays == null) return emptyAttendance();
    return normalizeAttendance({ workingDays, presentDays: attendance.presentDays });
  }

  const changedCount = rows.filter((row) => {
    const before = original[row.student.id];
    const after = draft[row.student.id];
    if (!before || !after) return false;
    return (
      JSON.stringify(normalizeAttendance(before.attendance)) !== JSON.stringify(submittedAttendance(row.student.id)) ||
      ECA_FIELDS.some((field) =>
        String(before.extraActivities?.[field.key] || '').trim() !== String(after.extraActivities?.[field.key] || '').trim())
    );
  }).length;

  // Typed figures are easy to lose by leaving the page before saving.
  useEffect(() => {
    if (!changedCount) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changedCount]);

  function setPresentDays(studentId, presentDays) {
    setDraft((current) => {
      const currentRow = current[studentId] || {};
      return {
        ...current,
        [studentId]: {
          ...currentRow,
          attendance: { ...(currentRow.attendance || {}), presentDays },
        },
      };
    });
    setError('');
    setSuccess('');
  }

  function changeWorkingDays(value) {
    setClassWorkingDays(value);
    setError('');
    setSuccess('');
  }

  /** Fill present days for students still blank, so only absences need typing. */
  function markAllPresent() {
    if (workingDays == null) return;
    setDraft((current) => {
      const next = { ...current };
      for (const row of editableRows) {
        const currentRow = next[row.student.id] || {};
        if (normalizeAttendance(currentRow.attendance).presentDays != null) continue;
        next[row.student.id] = {
          ...currentRow,
          attendance: { ...(currentRow.attendance || {}), presentDays: workingDays },
        };
      }
      return next;
    });
    setError('');
    setSuccess('');
  }

  function updateActivity(studentId, field, value) {
    setDraft((current) => {
      const currentRow = current[studentId] || {};
      return {
        ...current,
        [studentId]: {
          ...currentRow,
          extraActivities: {
            ...(currentRow.extraActivities || {}),
            [field]: value,
          },
        },
      };
    });
    setError('');
    setSuccess('');
  }

  const typedPresentDays = mode === 'attendance' &&
    rows.some((row) => normalizeAttendance(draft[row.student.id]?.attendance).presentDays != null);
  const missingWorkingDays = typedPresentDays && workingDays == null;
  const hasInvalidAttendance = mode === 'attendance' && workingDays != null &&
    rows.some((row) => {
      const presentDays = normalizeAttendance(draft[row.student.id]?.attendance).presentDays;
      return presentDays != null && presentDays > workingDays;
    });

  async function save(event) {
    event.preventDefault();
    if (!canEdit || hasInvalidAttendance || missingWorkingDays) return;
    const result = await run(
      '/api/cas/student-records',
      {
        method: 'POST',
        body: {
          academicYear: academicYear.id,
          grade: table.grade,
          section: table.section || undefined,
          exam: table.exam?.id || undefined,
          rows: rows.map((row) => {
            const rowDraft = draft[row.student.id] || {};
            return {
              student: row.student.id,
              revision: rowDraft.revision ?? row.revision ?? 0,
              attendance: submittedAttendance(row.student.id),
              extraActivities: Object.fromEntries(
                ECA_FIELDS.map((field) => [
                  field.key,
                  String(rowDraft.extraActivities?.[field.key] || '').trim(),
                ]),
              ),
            };
          }),
        },
      },
      {
        successMessage:
          mode === 'attendance'
            ? t('Attendance saved', 'Attendance saved')
            : t('Extra activities saved', 'Extra activities saved'),
      },
    );
    if (result.ok) {
      onSaved(result.data.table);
      setDraft(makeDraft(result.data.table));
    }
  }

  const hasLockedRows = rows.some((row) => row.locked);
  const savedActivityRows = rows.filter(activitiesSaved).length;
  const recordFor = table.exam?.name || t('the whole year', 'पूरा वर्ष');

  return (
    <form onSubmit={save}>
      <Card
        title={mode === 'attendance'
          ? t(`Attendance - ${recordFor}`, `उपस्थिति - ${recordFor}`)
          : t(`Extra Activities - ${recordFor}`, `अतिरिक्त क्रियाकलाप - ${recordFor}`)}
        description={mode === 'attendance'
          ? t(
            'Enter the working days once for the class, then each student\'s present days. Absent days are worked out for you.',
            'कक्षाको कार्य दिन एक पटक राख्नुहोस्, त्यसपछि प्रत्येक विद्यार्थीको उपस्थित दिन। अनुपस्थित दिन आफैं निकालिन्छ।',
          )
          : t(
            'Fill the table directly, then save the visible students together.',
            'Fill the table directly, then save the visible students together.',
          )}
        actions={(
          <Button type="submit" disabled={!canEdit || hasInvalidAttendance || missingWorkingDays || !changedCount}>
            <FaSave aria-hidden />
            {pending
              ? t('Saving...', 'Saving...')
              : changedCount
                ? t(`Save ${changedCount} change${changedCount === 1 ? '' : 's'}`, `${changedCount} परिवर्तन सेभ`)
                : t('Saved', 'Saved')}
          </Button>
        )}
      >
        {error && <Alert tone="danger">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
        {!table.canRecord && (
          <Alert tone="info">
            {t(
              'You have read-only access. A school administrator can save these fields.',
              'You have read-only access. A school administrator can save these fields.',
            )}
          </Alert>
        )}
        {hasLockedRows && (
          <Alert tone="warning">
            {t(
              'Published report rows are locked and cannot be changed.',
              'Published report rows are locked and cannot be changed.',
            )}
          </Alert>
        )}
        {savedActivityRows > 0 && (
          <Alert tone="info">
            {savedActivityRows === rows.length
              ? t(
                `Extra activities for ${recordFor} are already saved and shown read-only.`,
                `${recordFor} को अतिरिक्त क्रियाकलाप सेभ भइसकेको छ, हेर्न मात्र मिल्छ।`,
              )
              : t(
                'Students whose extra activities are already saved are shown read-only. Fill the remaining students.',
                'अतिरिक्त क्रियाकलाप सेभ भइसकेका विद्यार्थी हेर्न मात्र मिल्छ। बाँकी विद्यार्थी भर्नुहोस्।',
              )}
          </Alert>
        )}
        {missingWorkingDays && (
          <Alert tone="danger">
            {t('Enter the working days for the class first.', 'पहिले कक्षाको कार्य दिन राख्नुहोस्।')}
          </Alert>
        )}
        {hasInvalidAttendance && (
          <Alert tone="danger">
            {t(
              'Present days cannot be greater than working days.',
              'Present days cannot be greater than working days.',
            )}
          </Alert>
        )}

        {mode === 'attendance' && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface-2 p-3">
            <Field label={t('Working days (same for every student)', 'कार्य दिन (सबै विद्यार्थीको एउटै)')}>
              <Input
                type="number"
                min="0"
                max="400"
                value={classWorkingDays}
                disabled={!canEdit || !editableRows.length}
                className="max-w-[8rem] text-center text-base font-semibold"
                placeholder="e.g. 112"
                onChange={(event) => changeWorkingDays(event.target.value)}
              />
            </Field>
            {table.canRecord && editableRows.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                disabled={!canEdit || workingDays == null}
                onClick={markAllPresent}
                title={t(
                  'Sets present days equal to working days for students whose present days are still empty',
                  'उपस्थित दिन खाली भएका विद्यार्थीको उपस्थित दिन कार्य दिन बराबर राख्छ',
                )}
              >
                <FaCheckAll aria-hidden />
                {t('Mark all present', 'सबै उपस्थित')}
              </Button>
            )}
          </div>
        )}

        {mode === 'attendance' ? (
          <AttendanceTable
            rows={rows}
            attendanceOf={submittedAttendance}
            presentDaysOf={(studentId) => normalizeAttendance(draft[studentId]?.attendance).presentDays}
            canEdit={canEdit}
            onChange={(studentId, value) => setPresentDays(studentId, parseCount(value))}
            t={t}
          />
        ) : (
          <ActivitiesTable
            rows={rows}
            draft={draft}
            canEdit={canEdit}
            isSaved={activitiesSaved}
            onChange={updateActivity}
            t={t}
          />
        )}
      </Card>
    </form>
  );
}

/** The working days most students already have, to start the class figure. */
function commonWorkingDays(table) {
  const counts = new Map();
  for (const row of table?.students || []) {
    const value = normalizeAttendance(row.attendance).workingDays;
    if (value != null) counts.set(value, (counts.get(value) || 0) + 1);
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  return best == null ? '' : String(best);
}

function AttendanceTable({ rows, attendanceOf, presentDaysOf, canEdit, onChange, t }) {
  return (
    <TableWrap minWidth="36rem">
      <thead>
        <tr>
          <Th>{t('Students', 'Students')}</Th>
          <Th className="text-center">{t('Present days', 'Present days')}</Th>
          <Th className="text-center">{t('Absent days', 'Absent days')}</Th>
          <Th className="text-center">{t('Attendance', 'Attendance')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const attendance = attendanceOf(row.student.id);
          const disabled = !canEdit || row.locked;
          return (
            <tr key={row.student.id}>
              <Td label={t('Students', 'Students')}>
                <StudentName row={row} t={t} />
              </Td>
              <Td label={t('Present days', 'Present days')} className="text-center">
                <Input
                  type="number"
                  min="0"
                  max="400"
                  value={countValue(presentDaysOf(row.student.id))}
                  disabled={disabled}
                  className="mx-auto max-w-[7rem] text-center"
                  onChange={(event) => onChange(row.student.id, event.target.value)}
                />
              </Td>
              <Td label={t('Absent days', 'Absent days')} className="text-center">
                <span className="font-semibold tabular-nums text-ink">
                  {attendance.absentDays ?? <span className="text-muted">-</span>}
                </span>
              </Td>
              <Td label={t('Attendance', 'Attendance')} className="text-center">
                <AttendancePercent attendance={attendance} />
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

function AttendancePercent({ attendance }) {
  const { workingDays, presentDays } = attendance;
  if (!workingDays || presentDays == null) return <span className="text-muted">-</span>;
  if (presentDays > workingDays) return <span className="font-semibold text-danger">!</span>;
  const percent = Math.round((presentDays / workingDays) * 100);
  const tone = percent >= 90 ? 'text-success' : percent >= 75 ? 'text-ink' : 'text-danger';
  return <span className={`font-semibold tabular-nums ${tone}`}>{percent}%</span>;
}

function ActivitiesTable({ rows, draft, canEdit, isSaved, onChange, t }) {
  return (
    <TableWrap minWidth="78rem">
      <thead>
        <tr>
          <Th>{t('Students', 'Students')}</Th>
          {ECA_FIELDS.map((field) => (
            <Th key={field.key} className="text-center">
              {field.label}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const values = draft[row.student.id]?.extraActivities || {};
          const disabled = !canEdit || row.locked || isSaved(row);
          return (
            <tr key={row.student.id}>
              <Td label={t('Students', 'Students')}>
                <StudentName row={row} t={t} />
              </Td>
              {ECA_FIELDS.map((field) => (
                <Td key={field.key} label={field.label} className="text-center">
                  <Input
                    value={values[field.key] || ''}
                    maxLength={20}
                    disabled={disabled}
                    className="mx-auto max-w-[6rem] text-center uppercase"
                    onChange={(event) => onChange(row.student.id, field.key, event.target.value)}
                  />
                </Td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

function StudentName({ row, t }) {
  return (
    <span className="block min-w-[10rem]">
      <span className="block font-semibold text-ink">{row.student.name}</span>
      <span className="block text-xs text-muted">
        {[
          row.student.rollNumber ? `${t('Roll', 'Roll')} ${row.student.rollNumber}` : '',
          row.student.section ? `${t('Section', 'Section')} ${row.student.section}` : '',
        ]
          .filter(Boolean)
          .join(' - ') || t('No roll number', 'No roll number')}
      </span>
    </span>
  );
}
