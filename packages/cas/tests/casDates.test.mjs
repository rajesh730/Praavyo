import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDay,
  kathmanduToday,
  validateAssessmentDate,
  validatePeriodWindow,
  CasDateError,
} from '@pravyo/core/casDates';

const period = {
  titleEn: 'Assessment 1',
  startDate: '2026-03-01',
  endDate: '2026-03-31',
};
const academicYear = { startDate: '2026-01-01', endDate: '2026-12-31' };
// Fixed "now" so the suite does not drift with the wall clock.
const now = new Date('2026-04-15T06:00:00Z');

test('a well-formed calendar day is accepted', () => {
  assert.equal(parseDay('2026-03-10'), '2026-03-10');
});

test('malformed date text is rejected', () => {
  for (const bad of ['', '10/03/2026', '2026-3-10', 'yesterday', '2026-03-10T00:00:00Z', null]) {
    assert.throws(() => parseDay(bad), CasDateError, `${String(bad)} should be rejected`);
  }
});

test('a date that does not exist is rejected rather than rolled forward', () => {
  // new Date('2026-02-31') silently becomes March 3 — the round-trip catches it.
  assert.throws(() => parseDay('2026-02-31'), /not a real calendar date/);
  assert.throws(() => parseDay('2026-13-01'), CasDateError);
  assert.throws(() => parseDay('2025-02-29'), /not a real calendar date/);
  // 2028 is a leap year, so this one is real.
  assert.equal(parseDay('2028-02-29'), '2028-02-29');
});

test('Kathmandu day boundary, not the server UTC day', () => {
  // 18:30 UTC is already the next day in Kathmandu (UTC+5:45).
  assert.equal(kathmanduToday(new Date('2026-03-10T18:45:00Z')), '2026-03-11');
  assert.equal(kathmanduToday(new Date('2026-03-10T17:00:00Z')), '2026-03-10');
});

test('an assessment inside the period is accepted', () => {
  assert.equal(
    validateAssessmentDate({ value: '2026-03-10', period, academicYear, now }),
    '2026-03-10',
  );
});

test('a future-dated assessment is rejected', () => {
  assert.throws(
    () => validateAssessmentDate({
      value: '2026-05-01',
      period: { ...period, endDate: '2026-12-31' },
      academicYear,
      now,
    }),
    /cannot be dated in the future/,
  );
});

test('an assessment outside the selected period is rejected', () => {
  assert.throws(
    () => validateAssessmentDate({ value: '2026-04-05', period, academicYear, now }),
    /must fall inside Assessment 1/,
  );
  assert.throws(
    () => validateAssessmentDate({ value: '2026-02-20', period, academicYear, now }),
    /must fall inside Assessment 1/,
  );
});

test('an assessment outside the academic year is rejected', () => {
  assert.throws(
    () => validateAssessmentDate({
      value: '2025-12-20',
      period: { titleEn: 'Assessment 1', startDate: '2025-12-01', endDate: '2026-03-31' },
      academicYear,
      now,
    }),
    /inside the selected academic year/,
  );
});

test('a reassessment cannot predate the attempt it follows', () => {
  assert.throws(
    () => validateAssessmentDate({
      value: '2026-03-05',
      period,
      academicYear,
      previousAttempt: { assessmentDate: '2026-03-10' },
      now,
    }),
    /cannot be dated before the previous attempt/,
  );
  // Same day is allowed — a retake later the same day is legitimate.
  assert.equal(
    validateAssessmentDate({
      value: '2026-03-10',
      period,
      academicYear,
      previousAttempt: { assessmentDate: '2026-03-10' },
      now,
    }),
    '2026-03-10',
  );
  assert.equal(
    validateAssessmentDate({
      value: '2026-03-18',
      period,
      academicYear,
      previousAttempt: { assessmentDate: '2026-03-10' },
      now,
    }),
    '2026-03-18',
  );
});

test('a period window must be ordered and inside the academic year', () => {
  assert.deepEqual(
    validatePeriodWindow({ startDate: '2026-03-01', endDate: '2026-03-31', academicYear }),
    { startDate: '2026-03-01', endDate: '2026-03-31' },
  );
  assert.throws(
    () => validatePeriodWindow({ startDate: '2026-03-31', endDate: '2026-03-01', academicYear }),
    /start date must come before/,
  );
  assert.throws(
    () => validatePeriodWindow({ startDate: '2025-11-01', endDate: '2026-01-15', academicYear }),
    /inside the academic year/,
  );
});

test('assessment periods may not overlap each other', () => {
  const siblings = [{ titleEn: 'Assessment 1', startDate: '2026-03-01', endDate: '2026-03-31' }];
  assert.throws(
    () => validatePeriodWindow({
      startDate: '2026-03-25',
      endDate: '2026-05-01',
      academicYear,
      siblings,
    }),
    /overlaps Assessment 1/,
  );
  // Starting the day after the previous window closes is fine.
  assert.deepEqual(
    validatePeriodWindow({
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      academicYear,
      siblings,
    }),
    { startDate: '2026-04-01', endDate: '2026-06-30' },
  );
});
