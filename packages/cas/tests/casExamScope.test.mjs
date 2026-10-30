import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentExamFilter,
  examsThroughSelected,
  resultScopeKey,
} from '../lib/casExamScope.js';

test('cumulative scope includes exams only through the selected exam', () => {
  const exams = [{ _id: 'first' }, { _id: 'second' }, { _id: 'board' }];
  assert.deepEqual(examsThroughSelected(exams, 'second'), ['first', 'second']);
  assert.deepEqual(examsThroughSelected(exams, 'missing'), []);
});

test('assessment queries distinguish exam-only, cumulative, and all-exam results', () => {
  assert.deepEqual(assessmentExamFilter({ resultMode: 'EXAM', examId: 'second' }), { exam: 'second' });
  assert.deepEqual(assessmentExamFilter({
    resultMode: 'EXAM', examId: 'second', includePrevious: true, examIds: ['first', 'second'],
  }), { exam: { $in: ['first', 'second'] } });
  assert.deepEqual(assessmentExamFilter({ resultMode: 'MERGED', examId: 'second' }), {});
});

test('cumulative reports have a distinct result identity from single-exam reports', () => {
  assert.equal(resultScopeKey({ examId: 'second', themeAssignmentIds: ['assignment-1'] }), 'THEMES:second');
  assert.equal(resultScopeKey({ examId: 'second', includePrevious: true }), 'CUMULATIVE:second');
  assert.equal(resultScopeKey({ examId: 'second', includePrevious: false }), 'second');
  assert.equal(resultScopeKey({ resultMode: 'MERGED' }), 'MERGED');
});
