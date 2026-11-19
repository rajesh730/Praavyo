import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERNAL_GRADE_SCALE, gradeOf, gradeScaleForMarks, internalExamResult, subjectFullMarks } from '@pravyo/core/internalExamResult';
import { entryColumns, entryConflicts, entryFromRow, structureProblems } from '@pravyo/core/internalMarkScheme';

const subject = (id, fullMarks = 100, creditHours = null) => ({
  id,
  titleEn: id,
  fullMarks,
  creditHours,
  structure: { theoryFullMarks: 50, internalFullMarks: 50, fields: [] },
});

test('uses a 50 TH + 50 INT structure', () => {
  const result = internalExamResult({ subjects: [subject('math')], marks: { math: { theory: 40, internal: { INT: 40 } } } });
  assert.equal(result.subjects[0].fullMarks, 100);
  assert.equal(result.subjects[0].percent, 80);
  assert.equal(result.subjects[0].grade, 'A');
});

test('totals, percentage and grades across subjects', () => {
  const result = internalExamResult({
    subjects: [subject('math'), subject('science'), subject('english')],
    marks: { math: { theory: 25, internal: { INT: 25 } }, science: { theory: 21, internal: { INT: 21 } }, english: { theory: 16.5, internal: { INT: 16.5 } } },
  });
  assert.equal(result.complete, true);
  assert.equal(result.obtained, 125);
  assert.equal(result.fullMarks, 300);
  assert.equal(result.percent, 41.67);
  // No credit hours set: every subject weighs the same (1.6, 1.6, 1.2).
  assert.equal(result.gpa, 1.47);
});

test('a missing mark leaves the result incomplete and absence is recorded', () => {
  const missing = internalExamResult({ subjects: [subject('math'), subject('science')], marks: { math: { theory: 30, internal: { INT: 30 } } } });
  assert.equal(missing.complete, false);
  assert.equal(missing.percent, null);
  assert.equal(missing.gpa, null);

  const absent = internalExamResult({ subjects: [subject('math'), subject('science')], marks: { math: { theory: 30, internal: { INT: 30 } }, science: { absent: true } } });
  assert.equal(absent.complete, true);
  assert.equal(absent.subjects[1].grade, 'ABS');
});

test('uses per-subject full marks', () => {
  const exam = { fullMarks: 50, subjectFullMarks: [{ subject: 'computer', fullMarks: 25 }] };
  assert.equal(subjectFullMarks(exam, 'computer'), 25);
  assert.equal(subjectFullMarks(exam, 'math'), 50);
});

// ── TH/INT marks structure (owner spec 2026-11-19) ──────────────────────────
const fields = (...marks) => marks.map((fullMarks, index) => ({ id: `field${index + 1}`, name: `Field ${index + 1}`, fullMarks }));
const structured = (id, theoryFullMarks, internalFullMarks, fieldList = [], creditHours = null) => ({
  id, titleEn: id, creditHours, structure: { theoryFullMarks, internalFullMarks, fields: fieldList },
});
const internalOf = (...marks) => Object.fromEntries(marks.map((value, index) => [`field${index + 1}`, value]));

test('50/50: TH 42 + INT (10+8+9+9+10 = 46) = 88/100, no rescaling', () => {
  const science = structured('science', 50, 50, fields(10, 10, 10, 10, 10), 4);
  const result = internalExamResult({ subjects: [science], marks: { science: { theory: 42, internal: internalOf(10, 8, 9, 9, 10) } } });
  const line = result.subjects[0];
  assert.equal(line.theory.obtained, 42);
  assert.equal(line.theory.fullMarks, 50);
  assert.equal(line.internal.obtained, 46);
  assert.equal(line.obtained, 88);
  assert.equal(line.fullMarks, 100);
  assert.equal(line.percent, 88);
  // TH 84% → A, INT 92% → A+, final 88% → A. Grades are never averaged.
  assert.equal(line.theory.grade, 'A');
  assert.equal(line.internal.grade, 'A+');
  assert.equal(line.grade, 'A');
  assert.equal(line.gradePoint, 3.6);
  assert.equal(result.gpa, 3.6);
});

test('60/40 and 75/25 use their own full marks', () => {
  const sixty = internalExamResult({
    subjects: [structured('math', 60, 40, fields(10, 10, 10, 10))],
    marks: { math: { theory: 48, internal: internalOf(8, 9, 8, 9) } },
  }).subjects[0];
  assert.equal(sixty.internal.obtained, 34);
  assert.equal(sixty.obtained, 82);
  assert.equal(sixty.fullMarks, 100);
  assert.equal(sixty.theory.percent, 80);

  // No fields: INT is typed as one number.
  const seventyFive = internalExamResult({
    subjects: [structured('english', 75, 25)],
    marks: { english: { theory: 68, internal: { INT: 22 } } },
  }).subjects[0];
  assert.equal(seventyFive.obtained, 90);
  assert.equal(seventyFive.grade, 'A+');
});

test('a blank field is not zero: the subject stays unentered and ungraded', () => {
  const result = internalExamResult({
    subjects: [structured('science', 50, 50, fields(10, 10, 10, 10, 10))],
    marks: { science: { theory: 42, internal: internalOf(10, 8, 9, 9) } },
  });
  const line = result.subjects[0];
  assert.equal(line.entered, false);
  assert.equal(line.partial, true);
  assert.equal(line.obtained, null);
  assert.equal(line.grade, null);
  assert.equal(line.internal.obtained, null);
  assert.equal(line.internal.soFar, 36);
  assert.equal(result.complete, false);
  assert.equal(result.gpa, null);

  const zero = internalExamResult({
    subjects: [structured('science', 50, 50, fields(10, 10, 10, 10, 10))],
    marks: { science: { theory: 42, internal: internalOf(10, 8, 9, 9, 0) } },
  });
  assert.equal(zero.subjects[0].entered, true);
  assert.equal(zero.subjects[0].obtained, 78);
});

test('new scale: below 35% is NG with grade point 0.0, and it counts in the GPA', () => {
  assert.equal(gradeOf(34.99).grade, 'NG');
  assert.equal(gradeOf(34.99).gradePoint, 0);
  assert.equal(gradeOf(35).grade, 'D');
  assert.equal(gradeOf(90).gradePoint, 4);
  // 44.5/50 = 89% → A; 17.5/50 = 35% → D (the owner's out-of-50 table).
  assert.equal(gradeOf((44.5 / 50) * 100).grade, 'A');
  assert.equal(gradeOf((17.5 / 50) * 100).grade, 'D');
  const result = internalExamResult({
    subjects: [subject('math'), subject('science')],
    marks: { math: { theory: 50, internal: { INT: 50 } }, science: { theory: 5, internal: { INT: 5 } } },
  });
  assert.equal(result.subjects[1].grade, 'NG');
  assert.equal(result.gpa, 2); // (4.0 + 0.0) / 2
  assert.equal(INTERNAL_GRADE_SCALE.at(-1).point, '0.0');
  assert.equal(INTERNAL_GRADE_SCALE[1].range, '80 – 89');
});

test('theory and internal contribute to one subject grade', () => {
  const science = structured('science', 50, 50, fields(25, 25));
  // TH 15/50 + INT 48/50 = 63/100, graded by the overall subject percentage.
  const marks = { science: { theory: 15, internal: internalOf(24, 24) } };
  const result = internalExamResult({ subjects: [science], marks }).subjects[0];
  assert.equal(result.grade, 'B');
  assert.equal(result.gradePoint, 2.8);
});

test('structure validation: TH + INT = total, fields must fill INT exactly', () => {
  assert.deepEqual(structureProblems({ theoryFullMarks: 50, internalFullMarks: 50, fields: fields(10, 10, 10, 10, 10) }, { totalFullMarks: 100 }), []);
  assert.deepEqual(structureProblems({ theoryFullMarks: 50, internalFullMarks: 50, fields: fields(20, 10, 10, 10) }), []);
  assert.deepEqual(structureProblems({ theoryFullMarks: 75, internalFullMarks: 25, fields: [] }, { totalFullMarks: 100 }), []);
  assert.match(structureProblems({ theoryFullMarks: 50, internalFullMarks: 40 }, { totalFullMarks: 100 })[0], /not the total of 100/);
  const short = structureProblems({ theoryFullMarks: 50, internalFullMarks: 50, fields: fields(10, 10, 10) });
  assert.deepEqual(short, ['Allocated internal marks: 30/50. Please allocate the remaining 20 marks.']);
  const twice = structureProblems({ theoryFullMarks: 50, internalFullMarks: 20, fields: [{ id: 'aaaa', name: 'Test', fullMarks: 10 }, { id: 'bbbb', name: 'test', fullMarks: 10 }] });
  assert.match(twice[0], /listed twice/);
});

test('columns, old rows, and marks that would no longer fit', () => {
  const structure = { theoryFullMarks: 50, internalFullMarks: 20, fields: fields(10, 10) };
  assert.deepEqual(entryColumns(structure).map((column) => column.key), ['TH', 'field1', 'field2']);
  // A row saved before the split: its single mark is theory.
  assert.deepEqual(entryFromRow({ marks: 40, absent: false }), { theory: 40, internal: {}, absent: false });
  assert.deepEqual(entryConflicts(structure, { theory: 45, internal: { field1: 9 } }), []);
  assert.equal(entryConflicts({ ...structure, theoryFullMarks: 40 }, { theory: 45, internal: {} }).length, 1);
  assert.equal(entryConflicts({ ...structure, fields: fields(20) }, { theory: 1, internal: { field2: 5 } }).length, 1);
});

test('the 50-mark scale matches the owner table and the percentage grades', () => {
  const scale = gradeScaleForMarks(50);
  assert.deepEqual(scale.map((row) => row.score), [
    '45.0 – 50.0', '40.0 – 44.5', '35.0 – 39.5', '30.0 – 34.5', '25.0 – 29.5', '20.0 – 24.5', '17.5 – 19.5', 'Below 17.5',
  ]);
  assert.deepEqual(scale.map((row) => row.grade), ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'NG']);
  assert.deepEqual(scale.map((row) => row.point), ['4.0', '3.6', '3.2', '2.8', '2.4', '2.0', '1.6', '0.0']);
  assert.equal(scale[0].percent, '90% – 100%');
  assert.equal(scale[6].percent, '35% – 39%');
  assert.equal(scale[7].percent, 'Below 35%');
  // Every boundary score grades the same way as its percentage.
  assert.equal(gradeOf((44.5 / 50) * 100).grade, 'A');
  assert.equal(gradeOf((17.5 / 50) * 100).grade, 'D');
  assert.equal(gradeOf((17 / 50) * 100).grade, 'NG');
});
