import test from 'node:test';
import assert from 'node:assert/strict';
import { internalExamResult, passMarksFor, subjectFullMarks } from '@pravyo/core/internalExamResult';

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
