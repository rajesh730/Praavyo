'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCheck as FaCheckAll, Save as FaSave } from 'lucide-react';
import { emptyAttendance, normalizeAttendance } from '@pravyo/core/casSupplementary';
import { parseActivityMark } from '@pravyo/core/internalActivities';
import { useCasMutation } from '../lib/client/useCas.js';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  TableWrap,
  Td,
  Th,
} from './ui/Kit.js';

/**
 * The attendance or extra-activities table for one internal exam: working
 * days once for the class, then each student's present days; or each
 * student's extra-activity grades. Saves the visible students together.
 *
 * `table` comes from GET /api/cas/internal-exams/records and is replaced by
 * the table the save returns.
 */

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
        // Typed text per activity id: a mark, or old text such as "A".
        activities: Object.fromEntries(
          Object.entries(row.activityMarks || {}).map(([id, value]) => [id, value == null ? '' : String(value)]),
        ),
      },
    ]),
  );
}

/**
 * Until the exam is published every saved figure stays editable; publishing
 * locks the rows (`row.locked`), unpublishing reopens them.
 */
export default function StudentRecordsTable({ mode, table, onSaved, t }) {
  const { run, pending, error, success, setError, setSuccess } = useCasMutation();
  const [draft, setDraft] = useState(() => makeDraft(table));
  const [classWorkingDays, setClassWorkingDays] = useState(() => commonWorkingDays(table));
  const rows = table.students || [];
  // The school's own activities, each with its full marks (Manage Exams → Extra Activities).
  const activities = table.activities || [];
  const canEdit = table.canRecord && !pending;
  const editableRows = rows.filter((row) => !row.locked);
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
      activities.some((field) =>
        String(before.activities?.[field.id] || '').trim() !== String(after.activities?.[field.id] || '').trim())
    );
  }).length;

  /** Activity cells that are not a mark within full marks (old text such as "A" included). */
  const invalidActivities = mode === 'attendance' ? 0 : rows.reduce((sum, row) => sum + activities.filter((field) => {
    const text = draft[row.student.id]?.activities?.[field.id];
    const before = original[row.student.id]?.activities?.[field.id];
    if (String(text || '').trim() === String(before || '').trim()) return false;
    return parseActivityMark(text, field.fullMarks) === undefined;
  }).length, 0);

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

  /** A keystroke in an activity cell; refused when it is not a mark within full marks. */
  function updateActivity(studentId, field, text) {
    const value = text.trim();
    if (value && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      setError(t(`${field.name}: type a mark (a number).`, `${field.name}: अङ्क लेख्नुहोस्।`));
      return;
    }
    if (value && Number(value) > field.fullMarks) {
      setError(t(`${field.name}: the mark can't be more than ${field.fullMarks}.`, `${field.name}: अङ्क ${field.fullMarks} भन्दा बढी हुन सक्दैन।`));
      return;
    }
    setDraft((current) => {
      const currentRow = current[studentId] || {};
      return {
        ...current,
        [studentId]: {
          ...currentRow,
          activities: { ...(currentRow.activities || {}), [field.id]: value },
        },
      };
    });
    setError('');
    setSuccess('');
  }

  /** The marks a row sends: only the cells changed, as a number or null (cleared). */
  function submittedActivities(studentId) {
    const before = original[studentId]?.activities || {};
    const after = draft[studentId]?.activities || {};
    const marks = {};
    for (const field of activities) {
      if (String(after[field.id] || '').trim() === String(before[field.id] || '').trim()) continue;
      const parsed = parseActivityMark(after[field.id], field.fullMarks);
      if (parsed !== undefined) marks[field.id] = parsed;
    }
    return marks;
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
    if (!canEdit || hasInvalidAttendance || missingWorkingDays || invalidActivities) return;
    const result = await run(
      '/api/cas/internal-exams/records',
      {
        method: 'POST',
        body: {
          exam: table.exam.id,
          section: table.section || undefined,
          rows: rows.map((row) => {
            const rowDraft = draft[row.student.id] || {};
            return {
              student: row.student.id,
              revision: rowDraft.revision ?? row.revision ?? 0,
              attendance: submittedAttendance(row.student.id),
              activityMarks: submittedActivities(row.student.id),
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
  const recordFor = table.exam?.name || '';

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
            'Type each mark out of the full marks shown under the activity, then save. The school sets the activities and their full marks in Manage Exams → Extra Activities.',
            'हरेक क्रियाकलापमुनि देखाइएको पूर्णाङ्कभित्र अङ्क लेखेर सेभ गर्नुहोस्। क्रियाकलाप र पूर्णाङ्क परीक्षा व्यवस्थापन → अतिरिक्त क्रियाकलापमा तय हुन्छ।',
          )}
        actions={(
          <Button type="submit" disabled={!canEdit || hasInvalidAttendance || missingWorkingDays || Boolean(invalidActivities) || !changedCount}>
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
        {mode !== 'attendance' && !activities.length && (
          <Alert tone="info">
            {t('Your school has no extra activities. Add them in Manage Exams → Extra Activities.', 'विद्यालयमा कुनै अतिरिक्त क्रियाकलाप छैन। परीक्षा व्यवस्थापन → अतिरिक्त क्रियाकलापमा थप्नुहोस्।')}
          </Alert>
        )}
        {invalidActivities > 0 && (
          <Alert tone="danger">
            {t('Some activity cells are not a mark within their full marks. Correct or clear them before saving.', 'केही कोठाको अङ्क पूर्णाङ्कभित्र छैन। सेभ गर्नुअघि सच्याउनुहोस् वा खाली गर्नुहोस्।')}
          </Alert>
        )}
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
              'These results are published, so attendance and extra activities are locked. Unpublish the exam in Manage Exams to make changes.',
              'नतिजा प्रकाशित भएकाले हाजिरी र अतिरिक्त क्रियाकलाप लक छन्। परिवर्तन गर्न परीक्षा व्यवस्थापनमा अप्रकाशित गर्नुहोस्।',
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
            activities={activities}
            draft={draft}
            canEdit={canEdit}
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

function ActivitiesTable({ rows, activities, draft, canEdit, onChange, t }) {
  if (!activities.length) return null;
  return (
    <TableWrap minWidth={`${Math.max(36, 12 + activities.length * 8.5)}rem`}>
      <thead>
        <tr>
          <Th>{t('Students', 'Students')}</Th>
          {activities.map((field) => (
            <Th key={field.id} className="text-center">
              <span className="block">{field.name}</span>
              {/* Full marks under each activity, so every mark reads "out of". */}
              <span className="block font-normal normal-case text-muted">/ {field.fullMarks}</span>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const values = draft[row.student.id]?.activities || {};
          const disabled = !canEdit || row.locked;
          return (
            <tr key={row.student.id}>
              <Td label={t('Students', 'Students')}>
                <StudentName row={row} t={t} />
              </Td>
              {activities.map((field) => (
                <Td key={field.id} label={`${field.name} / ${field.fullMarks}`} className="text-center">
                  <Input
                    value={values[field.id] || ''}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={`/${field.fullMarks}`}
                    aria-label={`${row.student.name} ${field.name} out of ${field.fullMarks}`}
                    disabled={disabled}
                    className="mx-auto max-w-[6rem] text-center"
                    onChange={(event) => onChange(row.student.id, field, event.target.value)}
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
