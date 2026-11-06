'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCheck as FaCheckAll, Save as FaSave } from 'lucide-react';
import { ECA_FIELDS, emptyAttendance, normalizeAttendance } from '@pravyo/core/casSupplementary';
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
        extraActivities: { ...(row.extraActivities || {}) },
      },
    ]),
  );
}

/** Extra activities are entered once per exam; a saved row is read-only. */
function hasActivities(values) {
  return ECA_FIELDS.some((field) => String(values?.[field.key] || '').trim());
}

export default function StudentRecordsTable({ mode, table, onSaved, t }) {
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
              'These results are published, so attendance and extra activities are locked. Unpublish them on the Results screen to make changes.',
              'नतिजा प्रकाशित भएकाले हाजिरी र अतिरिक्त क्रियाकलाप लक छन्। परिवर्तन गर्न Results मा अप्रकाशित गर्नुहोस्।',
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
