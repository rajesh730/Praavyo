import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERNAL_GRADE_SCALE, gradeOf, internalExamResult, passMarksFor, subjectFullMarks } from '@pravyo/core/internalExamResult';
import { entryColumns, entryConflicts, entryFromRow, structureProblems } from '@pravyo/core/internalMarkScheme';

const subject = (id, fullMarks, creditHours = null) => ({ id, titleEn: id, fullMarks, creditHours });

test('marks grade as a percentage of the full marks the school chose', () => {
  const out50 = internalExamResult({ subjects: [subject('math', 50)], marks: { math: { marks: 40 } } });
  const out100 = internalExamResult({ subjects: [subject('math', 100)], marks: { math: { marks: 80 } } });
  assert.equal(out50.subjects[0].percent, 80);
  assert.equal(out50.subjects[0].grade, 'A');
  assert.equal(out100.subjects[0].grade, 'A');
});

test('totals, percentage and pass across subjects', () => {
  const result = internalExamResult({
    subjects: [subject('math', 50), subject('science', 50), subject('english', 50)],
    marks: { math: { marks: 50 }, science: { marks: 42 }, english: { marks: 33 } },
  });
  assert.equal(result.complete, true);
  assert.equal(result.obtained, 125);
  assert.equal(result.fullMarks, 150);
  assert.equal(result.percent, 83.33);
  assert.equal(result.passed, true);
  // No credit hours set: every subject weighs the same (4.0, 3.6, 2.8).
  assert.equal(result.gpa, 3.47);
});

test('a missing mark leaves the result incomplete, absent fails the subject', () => {
  const missing = internalExamResult({ subjects: [subject('math', 50), subject('science', 50)], marks: { math: { marks: 30 } } });
  assert.equal(missing.complete, false);
  assert.equal(missing.percent, null);
  assert.equal(missing.gpa, null);

  const absent = internalExamResult({ subjects: [subject('math', 50), subject('science', 50)], marks: { math: { marks: 30 }, science: { absent: true } } });
  assert.equal(absent.complete, true);
  assert.equal(absent.subjects[1].grade, 'ABS');
  assert.equal(absent.passed, false);
});

test('pass marks and per-subject full marks', () => {
  assert.equal(passMarksFor(50, 35), 17.5);
  const exam = { fullMarks: 50, subjectFullMarks: [{ subject: 'computer', fullMarks: 25 }] };
  assert.equal(subjectFullMarks(exam, 'computer'), 25);
  assert.equal(subjectFullMarks(exam, 'math'), 50);
  const below = internalExamResult({ subjects: [subject('math', 50)], marks: { math: { marks: 17 } } });
  assert.equal(below.subjects[0].passed, false);
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
    subjects: [subject('math', 50), subject('science', 50)],
    marks: { math: { marks: 50 }, science: { marks: 10 } },
  });
  assert.equal(result.subjects[1].grade, 'NG');
  assert.equal(result.gpa, 2); // (4.0 + 0.0) / 2
  assert.equal(INTERNAL_GRADE_SCALE.at(-1).point, '0.0');
  assert.equal(INTERNAL_GRADE_SCALE[1].range, '80 – 89');
});

test('theory and internal must each pass when passEachPart is on', () => {
  const science = structured('science', 50, 50, fields(25, 25));
  // TH 15/50 = 30% fails, though the total 15 + 48 = 63% would pass.
  const marks = { science: { theory: 15, internal: internalOf(24, 24) } };
  const strict = internalExamResult({ subjects: [science], marks }).subjects[0];
  assert.equal(strict.theory.passed, false);
  assert.equal(strict.passed, false);
  assert.equal(strict.grade, 'NG');
  assert.equal(strict.gradePoint, 0);
  const pooled = internalExamResult({ subjects: [science], marks, passEachPart: false }).subjects[0];
  assert.equal(pooled.passed, true);
  assert.equal(pooled.grade, 'B');
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
