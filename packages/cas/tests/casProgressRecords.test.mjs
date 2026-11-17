import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProgressRecords } from '../lib/casSheetService.js';

// Student Progress shows one record per outcome. When an outcome was recorded
// in more than one exam (or before exams existed), the choice must be the
// exam the theme is assigned to, never whichever the database returned last.
const FIRST = 'exam-first';
const SECOND = 'exam-second';
const assignedTo = (exam) => () => new Set([exam]);

const legacy = { outcome: 'o1', exam: null, attempts: [{ level: 2 }], updatedAt: '2026-11-15' };
const inFirst = { outcome: 'o1', exam: FIRST, attempts: [{ level: 4 }], updatedAt: '2026-10-01' };
const inSecond = { outcome: 'o1', exam: SECOND, attempts: [{ level: 3 }], updatedAt: '2026-11-01' };

test('prefers the record for the exam the theme is assigned to', () => {
  for (const order of [[legacy, inFirst, inSecond], [inSecond, inFirst, legacy], [inFirst, legacy, inSecond]]) {
    assert.equal(pickProgressRecords(order, assignedTo(FIRST)).get('o1'), inFirst);
  }
});

test('without an assigned exam, prefers a record that belongs to an exam over a pre-exam one', () => {
  const chosen = pickProgressRecords([legacy, inFirst], () => undefined).get('o1');
  assert.equal(chosen, inFirst);
});

test('between exam records of equal standing, the most recently updated wins', () => {
  const chosen = pickProgressRecords([inFirst, inSecond], () => undefined).get('o1');
  assert.equal(chosen, inSecond);
});

test('a pre-exam record is still shown when it is the only one', () => {
  assert.equal(pickProgressRecords([legacy], assignedTo(FIRST)).get('o1'), legacy);
});

test('keeps one record per outcome', () => {
  const other = { outcome: 'o2', exam: FIRST, attempts: [{ level: 1 }], updatedAt: '2026-10-01' };
  const chosen = pickProgressRecords([legacy, inFirst, other], assignedTo(FIRST));
  assert.equal(chosen.size, 2);
  assert.equal(chosen.get('o2'), other);
});
