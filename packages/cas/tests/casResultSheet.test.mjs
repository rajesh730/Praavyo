import test from 'node:test';
import assert from 'node:assert/strict';
import {
  themeResult, subjectResultSheet, finalResult, usesResultSheet, gradeNumber,
} from '../lib/casResultSheet.js';

/**
 * Pinned to Pravyo_CAS_Rajesh_Pandey_Grade3_Demo_Result.pdf, the school's
 * worked example of the calculation. Every figure asserted here is printed in
 * that document.
 */

const digits = (text) => text.split('+').map(Number);

// Where the PDF prints only "Sum of N achievement scores = S", any N levels of
// 3 and 4 adding up to S reproduce the row.
function levelsSumming(count, sum) {
  const fours = sum - 3 * count;
  return [...Array(fours).fill(4), ...Array(count - fours).fill(3)];
}

const NEPALI = [
  '4+3+4+4+4+3+3+4+4+4+3',
  '3+3+3+3+3+4+3+3+3+3+3+4+3',
  '4+4+3+3+4+4+3+4+3+3+3+4+4+4+4',
  '4+4+4+3+4+4+4+3+4+4+4+3+3+4+4+3+3',
  '3+3+3+3+3+3+3+4+4+3+3+3+3+3+3+3+3+3',
  '4+3+3+4+4+3+3+3+3+3+3+4+3+3+3+3+3+4+3',
  '3+3+4+3+4+3+4+3+4+3+3+3+4+4+3+3+3+4+4+4',
  '3+3+4+3+3+3+4+3+3+3+3+3+4+4+4+4+3+4+3+3+3+3',
  '3+3+3+3+3+3+4+4+4+3+3+4+3+3+3+4+3+4+4+3+4+3',
  '3+4+3+3+4+3+4+4+3+4+4+4+3+3+4+3+3+4+4+3+4+3',
  '4+3+3+3+4+4+3+3+4+4+4+4+4+3+3+3+3+3+3+3+4+3',
].map((row, index) => ({ key: `NEP-${index + 1}`, levels: digits(row) }));

const ENGLISH = [
  [26, 88], [23, 72], [22, 69], [22, 72], [20, 64],
  [25, 78], [27, 84], [26, 81], [26, 80], [19, 58],
].map(([count, sum], index) => ({ key: `ENG-${index + 1}`, levels: levelsSumming(count, sum) }));

const MATHEMATICS = [
  '4+4+3', '4+3+4+3+4+4', '4+4+4+3+4+3', '3+4+4+4+4+4+4+3+4+4', '4+3+4+4+4+4', '3+4+4+4+4', '4',
].map((row, index) => ({ key: `MATH-${index + 1}`, levels: digits(row) }));

const OUR_SURROUNDING = [
  '4+4+3+3+3+3', '3+3+3', '3+3+3+3', '3+3+3+3', '3+3', '3+3', '3+3', '3', '2+3', '3+3+3+3',
].map((row, index) => ({ key: `SURR-${index + 1}`, levels: digits(row) }));

test('a theme row: full marks are assessments x 4, obtained is the sum of scores', () => {
  const row = themeResult(NEPALI[0]);
  assert.equal(row.assessments, 11);
  assert.equal(row.fullMarks, 44);
  assert.equal(row.obtained, 40);
  assert.equal(row.percent, 90.91);
  assert.equal(row.grade, 'A+');
  assert.deepEqual(row.scores, digits('4+3+4+4+4+3+3+4+4+4+3'));

  const sanchar = themeResult(OUR_SURROUNDING[8]);
  assert.equal(sanchar.percent, 62.5);
  assert.equal(sanchar.grade, 'B');
});

test('every theme row in the four subject sections matches the PDF', () => {
  const expected = {
    NEPALI: [90.91, 78.85, 90, 91.18, 77.78, 81.58, 86.25, 82.95, 84.09, 87.5, 85.23],
    ENGLISH: [84.62, 78.26, 78.41, 81.82, 80, 78, 77.78, 77.88, 76.92, 76.32],
    MATHEMATICS: [91.67, 91.67, 91.67, 95, 95.83, 95, 100],
    OUR_SURROUNDING: [83.33, 75, 75, 75, 75, 75, 75, 75, 62.5, 75],
  };
  const sections = { NEPALI, ENGLISH, MATHEMATICS, OUR_SURROUNDING };
  for (const [name, themes] of Object.entries(sections)) {
    assert.deepEqual(themes.map((theme) => themeResult(theme).percent), expected[name], name);
  }
});

test('a subject percentage pools every theme rather than averaging theme percentages', () => {
  const nepali = subjectResultSheet({ creditHours: 5, themes: NEPALI });
  assert.equal(nepali.obtained, 683);
  assert.equal(nepali.fullMarks, 804);
  assert.equal(nepali.percent, 84.95);
  assert.equal(nepali.grade, 'A');
  assert.equal(nepali.gradePoint, 3.6);
  assert.equal(nepali.weightedGradePoint, 18);

  const english = subjectResultSheet({ creditHours: 4, themes: ENGLISH });
  assert.deepEqual(
    [english.obtained, english.fullMarks, english.percent, english.grade, english.gradePoint],
    [746, 944, 79.03, 'B+', 3.2],
  );

  const maths = subjectResultSheet({ creditHours: 4, themes: MATHEMATICS });
  assert.deepEqual(
    [maths.obtained, maths.fullMarks, maths.percent, maths.grade, maths.gradePoint],
    [139, 148, 93.92, 'A+', 4],
  );

  const surrounding = subjectResultSheet({ creditHours: 8, themes: OUR_SURROUNDING });
  assert.deepEqual(
    [surrounding.obtained, surrounding.fullMarks, surrounding.percent, surrounding.grade],
    [91, 120, 75.83, 'B+'],
  );
  assert.equal(surrounding.weightedGradePoint, 25.6);
});

test('the final summary divides 90.4 by 26 for a GPA of 3.48', () => {
  const subjects = [
    subjectResultSheet({ creditHours: 5, themes: NEPALI }),
    subjectResultSheet({ creditHours: 4, themes: ENGLISH }),
    subjectResultSheet({ creditHours: 4, themes: MATHEMATICS }),
    subjectResultSheet({ creditHours: 8, themes: OUR_SURROUNDING }),
    // The PDF assumes 83.00% for the local subject.
    subjectResultSheet({ creditHours: 5, themes: [{ key: 'LOCAL', levels: levelsSumming(100, 332) }] }),
  ];
  assert.equal(subjects[4].percent, 83);
  assert.deepEqual(subjects.map((s) => s.weightedGradePoint), [18, 12.8, 16, 25.6, 18]);

  const summary = finalResult(subjects);
  assert.equal(summary.totalCreditHours, 26);
  assert.equal(summary.totalWeightedGradePoints, 90.4);
  assert.equal(summary.gpa, 3.48);
});

test('unassessed outcomes, themes and subjects are left out rather than scored zero', () => {
  const partial = themeResult({ key: 'T', levels: [4, null, 3, null] });
  assert.equal(partial.outcomeCount, 4);
  assert.equal(partial.assessments, 2);
  assert.equal(partial.fullMarks, 8);
  assert.equal(partial.percent, 87.5);

  const untouched = subjectResultSheet({ creditHours: 5, themes: [{ key: 'T', levels: [null, null] }] });
  assert.equal(untouched.percent, null);
  assert.equal(untouched.weightedGradePoint, null);

  const noCredits = subjectResultSheet({ creditHours: null, themes: [{ key: 'T', levels: [4] }] });
  assert.equal(noCredits.grade, 'A+');
  assert.equal(noCredits.weightedGradePoint, null);

  const counted = subjectResultSheet({ creditHours: 4, themes: [{ key: 'T', levels: [3, 3] }] });
  const summary = finalResult([untouched, noCredits, counted]);
  assert.equal(summary.totalCreditHours, 4);
  // 3 + 3 of 8 is 75%, B+, 3.2 — and only this subject is counted.
  assert.equal(summary.totalWeightedGradePoints, 12.8);
  assert.equal(summary.gpa, 3.2);
  assert.equal(finalResult([untouched]).gpa, null);
});

test('the step-wise result applies to Grades 1-5 only', () => {
  for (const grade of ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'कक्षा ५', '3']) {
    assert.equal(usesResultSheet(grade), true, grade);
  }
  // Grades 6-10 will be graded by rules not yet agreed; names without a
  // number are not assumed to be primary grades.
  for (const grade of ['Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'कक्षा १०', 'Nursery', '', null]) {
    assert.equal(usesResultSheet(grade), false, String(grade));
  }
  assert.equal(gradeNumber('Grade 10'), 10);
  assert.equal(gradeNumber('कक्षा १०'), 10);
});
