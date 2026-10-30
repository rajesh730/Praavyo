import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBsNumeric, bsAcademicYearLabel, academicYearDisplayLabel, todayBsNumeric, formatBsNumeric,
} from '@pravyo/core/nepaliDate';

test('a typed B.S. issue date is read, normalised and checked', () => {
  assert.equal(parseBsNumeric('2083/06/08').bs, '2083/06/08');
  assert.equal(parseBsNumeric('2083/6/8').bs, '2083/06/08');
  assert.equal(parseBsNumeric(' 2083-06-08 ').bs, '2083/06/08');
  assert.equal(formatBsNumeric(parseBsNumeric('2083/06/08').ad), '2083/06/08', 'round trip');
  assert.equal(parseBsNumeric('2083/06/33'), null, 'no such day');
  assert.equal(parseBsNumeric('2083/13/01'), null, 'no such month');
  assert.equal(parseBsNumeric('24/09/2026'), null);
  assert.equal(parseBsNumeric(''), null);
});

test('academic years are labelled with their running B.S. year', () => {
  assert.equal(bsAcademicYearLabel(2026), '2083');
  assert.equal(bsAcademicYearLabel(2042), '2099');
  assert.equal(bsAcademicYearLabel(2083), '2083', 'a start year already in B.S.');
  assert.equal(bsAcademicYearLabel(undefined), '');
});

test('legacy academic-year ranges display as their running year', () => {
  assert.equal(academicYearDisplayLabel('2083/84'), '2083');
  assert.equal(academicYearDisplayLabel('2026-27'), '2026');
  assert.equal(academicYearDisplayLabel('', { yearStart: 2026, calendar: 'BS' }), '2083');
});

test('today is given in Kathmandu time', () => {
  // 2026-09-23 20:00 UTC is already 24 September in Kathmandu (UTC+5:45).
  assert.equal(todayBsNumeric(new Date('2026-09-23T20:00:00Z')), '2083/06/08');
});
