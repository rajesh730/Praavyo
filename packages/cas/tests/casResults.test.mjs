import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAcceptedLevel,
  getAcceptedAttemptNumber,
  needsReassessment,
  canReassess,
  minimumReassessmentLevel,
  isUnassessed,
  subjectResult,
  consolidate,
} from '@pravyo/core/casResults';

/** Build an attempt list from bare levels: first is REGULAR, rest reassessments. */
function attempts(...levels) {
  return levels.map((level, index) => ({
    attemptType: index === 0 ? 'REGULAR' : 'REASSESSMENT',
    attemptNumber: index + 1,
    level,
    assessmentDate: `2026-03-${String(10 + index).padStart(2, '0')}`,
  }));
}

test('accepted level is null when nothing has been assessed', () => {
  assert.equal(getAcceptedLevel([]), null);
  assert.equal(getAcceptedLevel(undefined), null);
  assert.equal(isUnassessed([]), true);
});

test('a regular attempt alone is the accepted level', () => {
  for (const level of [1, 2, 3, 4]) {
    assert.equal(getAcceptedLevel(attempts(level)), level);
  }
});

test('the spec worked examples for reassessment acceptance', () => {
  // Regular 2, reassessment 1 -> accepted stays 2. A bad day cannot cost the
  // student the level they already demonstrated.
  assert.equal(getAcceptedLevel(attempts(2, 1)), 2);
  // Regular 2, reassessment 2 -> 2
  assert.equal(getAcceptedLevel(attempts(2, 2)), 2);
  // Regular 2, reassessment 3 -> 3
  assert.equal(getAcceptedLevel(attempts(2, 3)), 3);
  // Regular 1, reassessment 4 -> 4
  assert.equal(getAcceptedLevel(attempts(1, 4)), 4);
  // Regular 2, reassessment 2, reassessment 1 -> 2
  assert.equal(getAcceptedLevel(attempts(2, 2, 1)), 2);
  // Regular 2, reassessment 3, reassessment 2 -> stays 3
  assert.equal(getAcceptedLevel(attempts(2, 3, 2)), 3);
});

test('accepted achievement never decreases across any attempt sequence', () => {
  // Exhaustive over every sequence of up to five attempts at levels 1-4.
  const walk = (history, depth) => {
    if (depth === 0) return;
    for (const level of [1, 2, 3, 4]) {
      const next = [...history, level];
      const before = getAcceptedLevel(attempts(...history));
      const after = getAcceptedLevel(attempts(...next));
      if (before !== null) {
        assert.ok(
          after >= before,
          `accepted dropped from ${before} to ${after} on [${next}]`,
        );
      }
      walk(next, depth - 1);
    }
  };
  walk([], 5);
});

test('accepted attempt number points at the attempt that earned it', () => {
  assert.equal(getAcceptedAttemptNumber(attempts(2, 3, 2)), 2);
  assert.equal(getAcceptedAttemptNumber(attempts(4, 1)), 1);
  assert.equal(getAcceptedAttemptNumber([]), null);
});

test('an invalid level is rejected rather than silently scored', () => {
  for (const bad of [0, 5, -1, 2.5, '3', null, undefined, NaN]) {
    assert.throws(
      () => getAcceptedLevel([{ level: bad, attemptNumber: 1 }]),
      /invalid achievement level/i,
      `level ${String(bad)} should be rejected`,
    );
  }
});

test('levels below 3 require reassessment, 3 and 4 do not', () => {
  assert.equal(needsReassessment(attempts(1)), true);
  assert.equal(needsReassessment(attempts(2)), true);
  assert.equal(needsReassessment(attempts(3)), false);
  assert.equal(needsReassessment(attempts(4)), false);
  // Unassessed is not "needs reassessment" — it has not been assessed once yet.
  assert.equal(needsReassessment([]), false);
  // Satisfied once the accepted level reaches 3.
  assert.equal(needsReassessment(attempts(2, 3)), false);
  // Still required while the accepted level stays below 3.
  assert.equal(needsReassessment(attempts(2, 1)), true);
});

test('subject achievement uses accepted levels — the spec worked example', () => {
  const result = subjectResult({
    subjectCode: 'MATH',
    outcomes: [{ code: 'O1' }, { code: 'O2' }, { code: 'O3' }],
    attemptsByOutcome: {
      O1: attempts(4),
      O2: attempts(2, 3), // accepted 3, not 2 and not the average
      O3: attempts(2),
    },
  });
  // sum 4+3+2 = 9, maximum 3 x 4 = 12, 9/12 = 75%
  assert.equal(result.achievement, 75);
  assert.equal(result.assessedCount, 3);
  assert.equal(result.coverage, 100);
  assert.equal(result.pendingReassessment, 1); // O3 at level 2
});

test('an unassessed outcome is excluded from achievement, not scored zero', () => {
  const result = subjectResult({
    subjectCode: 'NEP',
    outcomes: [{ code: 'O1' }, { code: 'O2' }, { code: 'O3' }, { code: 'O4' }],
    attemptsByOutcome: { O1: attempts(4), O2: attempts(4) },
  });
  // Two outcomes at level 4 -> 100% of what was assessed.
  assert.equal(result.achievement, 100);
  // Had the two unassessed outcomes counted as zero this would be 50%.
  assert.notEqual(result.achievement, 50);
  assert.equal(result.coverage, 50);
  assert.equal(result.fullyAssessed, false);
});

test('a subject with nothing assessed reports null achievement, not zero', () => {
  const result = subjectResult({
    subjectCode: 'ENG',
    outcomes: [{ code: 'O1' }, { code: 'O2' }],
    attemptsByOutcome: {},
  });
  assert.equal(result.achievement, null);
  assert.equal(result.averageLevel, null);
  assert.equal(result.coverage, 0);
});

test('consolidation weights subjects by how much was assessed', () => {
  const math = subjectResult({
    subjectCode: 'MATH',
    outcomes: [{ code: 'A' }, { code: 'B' }, { code: 'C' }, { code: 'D' }],
    attemptsByOutcome: { A: attempts(4), B: attempts(4), C: attempts(4), D: attempts(4) },
  });
  const eng = subjectResult({
    subjectCode: 'ENG',
    outcomes: [{ code: 'A' }],
    attemptsByOutcome: { A: attempts(1) },
  });
  const total = consolidate([math, eng]);
  // (100*4 + 25*1) / 5 = 85, not the unweighted mean of 62.5.
  assert.equal(total.achievement, 85);
  assert.equal(total.assessedCount, 5);
  assert.equal(total.pendingReassessment, 1);
});

test('a score of 3 or below may be reassessed, a 4 may not', () => {
  assert.equal(canReassess([]), false);
  for (const level of [1, 2, 3]) assert.equal(canReassess(attempts(level)), true);
  assert.equal(canReassess(attempts(4)), false);
  assert.equal(canReassess(attempts(2, 2)), true);
  assert.equal(canReassess(attempts(2, 4)), false);
});

test('the advisory reassessment floor reports the best result so far', () => {
  assert.equal(minimumReassessmentLevel([]), null);
  assert.equal(minimumReassessmentLevel(attempts(2)), 2);
  assert.equal(minimumReassessmentLevel(attempts(2, 3)), 3);
});
