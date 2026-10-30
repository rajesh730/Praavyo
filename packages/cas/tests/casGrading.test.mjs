import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFor,
  calculateGpa,
  gradeForGpa,
  GRADE_BANDS,
} from '@pravyo/core/casGrading';

test('every band boundary from page 6 of the book', () => {
  const expected = [
    [100, 4.0, 'A+'], [90, 4.0, 'A+'],
    [89.99, 3.6, 'A'], [80, 3.6, 'A'],
    [79.99, 3.2, 'B+'], [70, 3.2, 'B+'],
    [69.99, 2.8, 'B'], [60, 2.8, 'B'],
    [59.99, 2.4, 'C+'], [50, 2.4, 'C+'],
    [49.99, 2.0, 'C'], [40, 2.0, 'C'],
    [39.99, 1.6, 'D'], [35, 1.6, 'D'],
    [34.99, null, 'NG'], [0, null, 'NG'],
  ];
  for (const [percent, gradePoint, grade] of expected) {
    const result = gradeFor(percent);
    assert.equal(result.grade, grade, `${percent}% should be ${grade}`);
    assert.equal(result.gradePoint, gradePoint, `${percent}% should be ${gradePoint}`);
  }
});

test('an unassessed subject has no grade at all, and is not NG', () => {
  // "Not assessed" and "assessed and below 35%" are different statements.
  assert.equal(gradeFor(null), null);
  assert.equal(gradeFor(undefined), null);
  assert.equal(gradeFor(NaN), null);
  assert.equal(gradeFor(0).grade, 'NG');
});

test('each band carries both an English and a Nepali remark', () => {
  for (const band of GRADE_BANDS) {
    assert.ok(band.remarkEn, `${band.grade} needs an English remark`);
    assert.ok(band.remarkNe, `${band.grade} needs a Nepali remark`);
  }
  assert.equal(gradeFor(95).remarkNe, 'सर्वोत्तम');
  assert.equal(gradeFor(85).remarkEn, 'Excellent');
});

test("the book's own GPA worked example, page 62", () => {
  // Nepali 3.6/5, English 4.0/4, Mathematics 4.0/4,
  // Our Surrounding 3.2/8, Local Subject 3.2/5  ->  91.6 / 26 = 3.52
  const gpa = calculateGpa([
    { gradePoint: 3.6, creditHours: 5 },
    { gradePoint: 4.0, creditHours: 4 },
    { gradePoint: 4.0, creditHours: 4 },
    { gradePoint: 3.2, creditHours: 8 },
    { gradePoint: 3.2, creditHours: 5 },
  ]);
  assert.equal(gpa, 3.52);
});

test('the GPA is weighted by credit hours, not a plain mean', () => {
  const gpa = calculateGpa([
    { gradePoint: 4.0, creditHours: 8 },
    { gradePoint: 2.0, creditHours: 2 },
  ]);
  // (32 + 4) / 10 = 3.6, not the unweighted 3.0.
  assert.equal(gpa, 3.6);
  assert.notEqual(gpa, 3.0);
});

test('subjects with nothing to grade are excluded from the GPA entirely', () => {
  const gpa = calculateGpa([
    { gradePoint: 4.0, creditHours: 4 },
    { gradePoint: null, creditHours: 8 }, // not assessed
    { gradePoint: 3.0, creditHours: 0 },  // no credit hours
    { gradePoint: 2.0, creditHours: null },
  ]);
  // Only the first subject counts; averaging a zero in would say something
  // false about a child who simply has not been assessed yet.
  assert.equal(gpa, 4.0);
});

test('a GPA with nothing gradeable is null, not zero', () => {
  assert.equal(calculateGpa([]), null);
  assert.equal(calculateGpa([{ gradePoint: null, creditHours: 5 }]), null);
  assert.equal(calculateGpa(undefined), null);
});

test('the overall grade maps back through the same table', () => {
  assert.equal(gradeForGpa(4.0).grade, 'A+');
  assert.equal(gradeForGpa(3.52).grade, 'B+');
  assert.equal(gradeForGpa(3.6).grade, 'A');
  assert.equal(gradeForGpa(1.5).grade, 'NG');
  assert.equal(gradeForGpa(null), null);
});
