import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedRowLevel, summariseRows } from '../lib/client/sheetTotals.js';
import { subjectResult } from '@pravyo/core/casResults';

test('an empty book page has no achievement or grade', () => {
  const totals = summariseRows([
    { outcome: 'A', regularLevel: null, remedialLevel: null, acceptedLevel: null },
    { outcome: 'B' },
  ]);
  assert.equal(totals.outcomeCount, 2);
  assert.equal(totals.fullMarks, 8);
  assert.equal(totals.assessedCount, 0);
  assert.equal(totals.obtained, 0);
  assert.equal(totals.percent, null);
  assert.equal(totals.grade, null);
  assert.equal(totals.complete, false);
  assert.equal(summariseRows().complete, false);
});

test('partially assessed sheets exclude blanks from achievement', () => {
  const totals = summariseRows(
    [{ outcome: 'A' }, { outcome: 'B' }, { outcome: 'C' }],
    { A: { regularLevel: 4 }, B: { regularLevel: '' } },
  );
  assert.equal(totals.fullMarks, 12);
  assert.equal(totals.assessedFullMarks, 4);
  assert.equal(totals.assessedCount, 1);
  assert.equal(totals.percent, 100);
  assert.equal(totals.grade, 'A+');
  assert.equal(totals.complete, false);
});

test('the supplied book example earns 39 of 44 marks, 88.64 percent and A', () => {
  const regular = [3, 3, 2, 3, 4, 3, 3, 4, 3, 4, 4];
  const remedial = [4, 3, 3, 3, null, 3, 3, null, 4, null, null];
  const totals = summariseRows(regular.map((level, index) => ({
    outcome: `NEP-T1-${index + 1}`,
    regularLevel: level,
    remedialLevel: remedial[index],
  })));
  assert.equal(totals.outcomeCount, 11);
  assert.equal(totals.fullMarks, 44);
  assert.equal(totals.obtained, 39);
  assert.equal(totals.percent, 88.64);
  assert.equal(totals.grade, 'A');
  assert.equal(totals.complete, true);
});

test('an earlier earned result survives a lower latest reassessment and draft', () => {
  const row = { outcome: 'A', regularLevel: 2, remedialLevel: 1, acceptedLevel: 3 };
  assert.equal(acceptedRowLevel(row), 3);
  assert.equal(acceptedRowLevel(row, { remedialLevel: 2 }), 3);
  assert.equal(acceptedRowLevel(row, { remedialLevel: 4 }), 4);
});

test('before publishing, a corrected or cleared score replaces the saved result', () => {
  const row = { outcome: 'A', regularLevel: 2, remedialLevel: 1, acceptedLevel: 3 };
  // Clearing the whole row (a mistaken entry) leaves it unassessed.
  assert.equal(acceptedRowLevel(row, { regularLevel: null, remedialLevel: null }), null);
  // Correcting the regular score: only what the page now shows counts.
  assert.equal(acceptedRowLevel(row, { regularLevel: 1, remedialLevel: 1 }), 1);
  // Clearing extra support falls back to the regular score.
  assert.equal(acceptedRowLevel(row, { regularLevel: 2, remedialLevel: null }), 2);
  assert.equal(acceptedRowLevel({ regularLevel: 4 }, { regularLevel: null }), null);
  assert.equal(acceptedRowLevel({ regularLevel: 4, acceptedLevel: 4 }, { regularLevel: null }), null);
  assert.equal(acceptedRowLevel({ regularLevel: 4, acceptedLevel: 4 }, { regularLevel: 3 }), 3);
});

test('sheet and existing report arithmetic agree across reassessments and blanks', () => {
  const outcomes = [{ code: 'A' }, { code: 'B' }, { code: 'C' }, { code: 'D' }];
  const attemptsByOutcome = {
    A: [{ level: 2 }, { level: 3 }, { level: 1 }],
    B: [{ level: 4 }],
    C: [{ level: 1 }, { level: 2 }],
  };
  const report = subjectResult({ subjectCode: 'NEP', outcomes, attemptsByOutcome });
  const totals = summariseRows([
    { outcome: 'A', acceptedLevel: 3, regularLevel: 2, remedialLevel: 1 },
    { outcome: 'B', regularLevel: 4 },
    { outcome: 'C', regularLevel: 1, remedialLevel: 2 },
    { outcome: 'D' },
  ]);
  assert.equal(totals.percent, report.achievement);
  assert.equal(totals.assessedCount, report.assessedCount);
  assert.equal(totals.complete, report.fullyAssessed);
});

test('invalid stored or draft marks are never silently scored', () => {
  for (const bad of [0, 5, -1, 2.5, '3', NaN]) {
    assert.throws(() => acceptedRowLevel({ acceptedLevel: bad }), /invalid achievement level/i);
    assert.throws(() => acceptedRowLevel({}, { regularLevel: bad }), /invalid achievement level/i);
  }
});
