import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sheetInput,
  sheetQuery,
  studentProgressQuery,
  reportInput,
  publishInput,
  studentRecordInput,
  studentRecordsInput,
  outcomeInput,
  examCreateInput,
  examUpdateInput,
} from '../lib/casValidation.js';

const scope = {
  academicYear: 'aaaaaaaaaaaaaaaaaaaaaaaa', grade: 'Grade 3',
  exam: 'eeeeeeeeeeeeeeeeeeeeeeee',
  subject: 'bbbbbbbbbbbbbbbbbbbbbbbb', themeKey: 'म र मेरो परिवार|My family',
  student: 'cccccccccccccccccccccccc',
};
const row = () => ({
  outcome: 'dddddddddddddddddddddddd', revision: 0,
  regularLevel: 2, regularDate: '2025-05-10', remedialLevel: null, remedialDate: '', remarks: '',
});
const input = (changes = {}) => ({ ...scope, rows: [row()], ...changes });

test('sheet requests require school-derived scope and an observed revision', () => {
  assert.ok(sheetInput.safeParse(input()).success);
  assert.ok(sheetQuery.safeParse(scope).success);
  assert.ok(studentProgressQuery.safeParse({
    academicYear: scope.academicYear,
    grade: scope.grade,
    subject: scope.subject,
    student: scope.student,
  }).success);
  for (const field of ['academicYear', 'grade', 'subject', 'themeKey', 'student']) {
    const missing = input();
    delete missing[field];
    assert.equal(sheetInput.safeParse(missing).success, false, field);
  }
  const missingRevision = input();
  delete missingRevision.rows[0].revision;
  assert.equal(sheetInput.safeParse(missingRevision).success, false);
  assert.equal(sheetInput.safeParse(input({ school: 'eeeeeeeeeeeeeeeeeeeeeeee' })).success, false);
  assert.equal(studentProgressQuery.safeParse({
    academicYear: scope.academicYear,
    grade: scope.grade,
    subject: scope.subject,
    student: scope.student,
    school: 'eeeeeeeeeeeeeeeeeeeeeeee',
  }).success, false);
});

test('a partially assessed page accepts untouched rows but never silently drops marks or dates', () => {
  const blank = { ...row(), regularLevel: null, regularDate: '' };
  assert.ok(sheetInput.safeParse(input({ rows: [blank] })).success);
  for (const broken of [
    { ...row(), regularDate: '' },
    { ...row(), regularLevel: null },
    { ...row(), remedialLevel: 3, remedialDate: '' },
    { ...row(), remedialDate: '2025-05-11' },
    { ...blank, remedialLevel: 3, remedialDate: '2025-05-11' },
  ]) {
    assert.equal(sheetInput.safeParse(input({ rows: [broken] })).success, false);
  }
});

test('one theme remark is accepted without scores; per-outcome remarks are ignored', () => {
  const blank = { ...row(), regularLevel: null, regularDate: '' };
  assert.ok(sheetInput.safeParse(input({ rows: [blank], themeRemarks: 'Needs reading practice', themeRemarksRevision: 0 })).success);
  assert.ok(sheetInput.safeParse(input({ rows: [{ ...blank, remarks: 'Old client remark' }] })).success);
  assert.equal(sheetInput.parse(input({ rows: [blank] })).themeRemarks, undefined);
  assert.equal(sheetInput.safeParse(input({ rows: [blank], themeRemarks: 'x'.repeat(1001) })).success, false);
});

test('marks outside levels 1â€“4 and malformed dates are rejected', () => {
  for (const level of [0, 5, 2.5, '3', NaN]) {
    assert.equal(sheetInput.safeParse(input({ rows: [{ ...row(), regularLevel: level }] })).success, false);
  }
  for (const regularDate of ['05/10', 'à¥¨à¥¦à¥®à¥¨-à¥¦à¥§-à¥§à¥¦', '2025-5-10']) {
    assert.equal(sheetInput.safeParse(input({ rows: [{ ...row(), regularDate }] })).success, false);
  }
});

test('duplicate outcome identifiers cannot cause two changes to the same record', () => {
  const first = row();
  assert.equal(sheetInput.safeParse(input({ rows: [first, { ...first }] })).success, false);
  assert.equal(sheetInput.safeParse(input({ rows: [first, { ...first, outcome: first.outcome.toUpperCase() }] })).success, false);
});

test('student attendance and extra activities use bounded report-card fields', () => {
  const record = {
    academicYear: scope.academicYear,
    grade: scope.grade,
    student: scope.student,
    revision: 0,
    attendance: { workingDays: 60, presentDays: 53, absentDays: 7 },
    extraActivities: {
      discipline: 'A',
      personalHygiene: 'A',
      classWork: 'A',
      homeWork: 'A',
      eca: 'A',
      artCraft: 'A',
      handwriting: 'A',
      projectPresentation: 'A',
    },
  };

  assert.ok(studentRecordInput.safeParse(record).success);
  assert.equal(studentRecordInput.safeParse({
    ...record,
    attendance: { workingDays: 60, presentDays: 61 },
  }).success, false);
  assert.equal(studentRecordInput.safeParse({
    ...record,
    extraActivities: { ...record.extraActivities, discipline: 'A'.repeat(21) },
  }).success, false);
  assert.equal(studentRecordInput.safeParse({ ...record, school: 'eeeeeeeeeeeeeeeeeeeeeeee' }).success, false);
});

test('bulk student records reject duplicate students and invalid attendance', () => {
  const row = {
    student: scope.student,
    revision: 0,
    attendance: { workingDays: 60, presentDays: 57 },
    extraActivities: {
      discipline: 'A',
      personalHygiene: 'A',
      classWork: 'A',
      homeWork: 'A',
      eca: 'A',
      artCraft: 'A',
      handwriting: 'A',
      projectPresentation: 'A',
    },
  };
  const bulk = {
    academicYear: scope.academicYear,
    grade: scope.grade,
    section: 'A',
    rows: [row],
  };

  assert.ok(studentRecordsInput.safeParse(bulk).success);
  assert.equal(studentRecordsInput.safeParse({ ...bulk, rows: [row, row] }).success, false);
  assert.equal(studentRecordsInput.safeParse({
    ...bulk,
    rows: [{ ...row, attendance: { workingDays: 60, presentDays: 61 } }],
  }).success, false);
  assert.equal(studentRecordsInput.safeParse({ ...bulk, school: 'eeeeeeeeeeeeeeeeeeeeeeee' }).success, false);
});
test('report generation stores only supported parent report formats', () => {
  const report = {
    academicYear: scope.academicYear,
    grade: scope.grade,
    students: [scope.student],
    format: 'CLASSIC',
  };

  assert.equal(reportInput.parse(report).format, 'CLASSIC');
  assert.equal(reportInput.parse({ ...report, format: undefined }).format, 'CLASSIC');
  assert.equal(reportInput.safeParse({ ...report, format: 'MODERN' }).success, true);
  assert.equal(reportInput.safeParse({ ...report, format: 'POSTER' }).success, false);
  assert.equal(reportInput.safeParse({ ...report, school: 'eeeeeeeeeeeeeeeeeeeeeeee' }).success, false);
});

test('exam report settings require a valid B.S. issue date and reject extra fields', () => {
  const exam = {
    academicYear: scope.academicYear,
    name: 'First Terminal Exam',
    reportTitle: 'First Terminal Examination',
    issueDate: '2083/06/28',
  };

  assert.ok(examCreateInput.safeParse(exam).success);
  assert.ok(examUpdateInput.safeParse({ ...exam, exam: scope.exam }).success);
  assert.equal(examCreateInput.safeParse({ ...exam, issueDate: '2083/06/33' }).success, false);
  assert.equal(examCreateInput.safeParse({ ...exam, school: scope.student }).success, false);
});

test('report publishing accepts an optional scheduled YYYY-MM-DD date', () => {
  const publish = { reports: [scope.student], publishDate: '2026-09-30' };

  assert.ok(publishInput.safeParse(publish).success);
  assert.ok(publishInput.safeParse({ reports: [scope.student] }).success);
  assert.equal(publishInput.safeParse({ ...publish, publishDate: '09/30/2026' }).success, false);
  assert.equal(publishInput.safeParse({ ...publish, school: 'eeeeeeeeeeeeeeeeeeeeeeee' }).success, false);
});

test('several assessment areas and tools keep their English/Nepali pairing by line', () => {
  const parse = (fields) => outcomeInput.parse({ subject: 'bbbbbbbbbbbbbbbbbbbbbbbb', titleEn: 'Outcome', ...fields });
  const both = parse({ assessmentAspect: ' Listening \nSpeaking', assessmentAspectNe: 'सुनाइ\nबोलाइ ' });
  assert.equal(both.assessmentAspect, 'Listening\nSpeaking');
  assert.equal(both.assessmentAspectNe, 'सुनाइ\nबोलाइ');
  // A leading blank line is what pairs "Speaking" with the second Nepali entry.
  assert.equal(parse({ assessmentTool: '\nObservation' }).assessmentTool, '\nObservation');
  assert.equal(parse({ assessmentTool: ' \n \n' }).assessmentTool, '');
  assert.throws(() => parse({ assessmentTool: 'x'.repeat(2101) }));
});
