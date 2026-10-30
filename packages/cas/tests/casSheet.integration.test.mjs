import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { register } from 'node:module';
import mongoose from 'mongoose';
import { CasDateError } from '@pravyo/core/casDates';
import { startLocalMongo } from './helpers/localMongo.mjs';

// Opt in with CAS_TEST_MONGOD pointing at a local mongod executable.
// No .env file is loaded and no caller-provided MongoDB URI is used.
describe('student book persistence on an isolated MongoDB replica set', {
  skip: process.env.CAS_TEST_MONGOD ? false : 'Set CAS_TEST_MONGOD to run database integration tests',
}, () => {
  let mongo;
  let service;
  let Student, AcademicYear, Subject, Outcome, Assessment, Report, Exam, ThemeExam, TeacherAssignment;
  const originalUri = process.env.MONGODB_URI;
  const id = () => new mongoose.Types.ObjectId();

  before(async () => {
    mongo = await startLocalMongo(process.env.CAS_TEST_MONGOD);
    process.env.MONGODB_URI = mongo.uri;
    register('./helpers/service-loader.mjs', import.meta.url);
    service = await import('../lib/casSheetService.js');
    [Student, AcademicYear, Subject, Outcome, Assessment, Report, Exam, ThemeExam, TeacherAssignment] = await Promise.all([
      import('@pravyo/db/models/Student'), import('@pravyo/db/models/AcademicYear'),
      import('@pravyo/db/models/cas/CasSubject'), import('@pravyo/db/models/cas/CasLearningOutcome'),
      import('@pravyo/db/models/cas/CasAssessment'), import('@pravyo/db/models/cas/CasReport'),
      import('@pravyo/db/models/cas/CasExam'), import('@pravyo/db/models/cas/CasThemeExam'),
      import('@pravyo/db/models/cas/CasExamTeacherAssignment'),
    ]).then((modules) => modules.map((module) => module.default));
    const { default: connectDB } = await import('@pravyo/db');
    await connectDB();
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
  });

  async function fixture() {
    const school = id();
    const actor = { id: String(school), school: String(school), role: 'SCHOOL_ADMIN', name: 'Test school' };
    const year = await AcademicYear.create({ school, year: '2025-26', yearStart: 2025 });
    const subject = await Subject.create({ school, grade: 'Grade 3', code: 'NEP', titleEn: 'Nepali' });
    const outcomes = await Outcome.create([1, 2].map((sequence) => ({
      school, grade: 'Grade 3', subject: subject._id, subjectCode: 'NEP', code: `N${sequence}`,
      themeNe: 'म र मेरो परिवार', themeEn: 'My family', titleNe: `सिकाइ उपलब्धि ${sequence}`,
      assessmentAspect: 'श्रुतिकथन', assessmentTool: 'अवलोकन', sequence,
    })));
    const exam = await Exam.create({
      school, academicYear: year._id, name: 'First Terminal Examination', issueDate: '2082/06/28',
    });
    await ThemeExam.create({
      school, academicYear: year._id, exam: exam._id, grade: 'Grade 3', subject: subject._id,
      themeKey: 'म र मेरो परिवार|My family',
    });
    const students = [id(), id()];
    await Student.collection.insertMany(students.map((_id, index) => ({
      _id, school, name: `Synthetic student ${index + 1}`, status: 'ACTIVE',
      enrollments: [{ school, grade: 'Grade 3', academicYearStart: 2025, rollNumber: String(index + 1) }],
    })));
    const scope = {
      academicYear: String(year._id), exam: String(exam._id), grade: 'Grade 3', subject: String(subject._id),
      themeKey: 'म र मेरो परिवार|My family', student: String(students[0]),
    };
    const payload = (changes = {}) => ({
      ...scope,
      rows: outcomes.map((outcome) => ({
        outcome: String(outcome._id), revision: 0, regularLevel: 2, regularDate: '2025-05-10',
        remedialLevel: null, remedialDate: '', remarks: '',
      })),
      ...changes,
    });
    return { actor, year, exam, subject, outcomes, students, scope, payload };
  }

  function rowsFrom(sheet) {
    return sheet.rows.map(({ outcome, revision, regularLevel, regularDate, remedialLevel, remedialDate, remarks }) => ({
      outcome, revision, regularLevel, regularDate, remedialLevel, remedialDate, remarks,
    }));
  }

  it('saves both assessment columns and Nepali remarks, then reloads the canonical student page', async () => {
    const f = await fixture();
    const blank = await service.loadStudentSheet(f.actor, f.scope);
    assert.equal(blank.rows.length, 2);
    assert.equal(blank.rows[0].regularLevel, null);
    const input = f.payload();
    input.rows[0] = { ...input.rows[0], remedialLevel: 3, remedialDate: '2025-05-11', remarks: 'राम्रो प्रगति' };
    input.rows[1].regularLevel = 4;
    const result = await service.saveSheet(f.actor, input);
    assert.equal(result.saved, 2);
    assert.equal(result.sheet.student.id, f.scope.student);
    const reloaded = await service.loadStudentSheet(f.actor, f.scope);
    assert.deepEqual(rowsFrom(reloaded), rowsFrom(result.sheet));
    assert.equal(reloaded.rows[0].regularLevel, 2);
    assert.equal(reloaded.rows[0].remedialLevel, 3);
    assert.equal(reloaded.rows[0].remarks, 'राम्रो प्रगति');
    assert.equal(reloaded.rows[0].acceptedLevel, 3);
    assert.equal(reloaded.totals.obtained, 7);
    assert.equal(reloaded.totals.percent, 87.5);
  });

  it('keeps one student’s marks separate from other students, years and subjects', async () => {
    const f = await fixture();
    await service.saveSheet(f.actor, f.payload());
    const otherStudent = await service.loadStudentSheet(f.actor, { ...f.scope, student: String(f.students[1]) });
    assert.ok(otherStudent.rows.every((row) => row.regularLevel === null));
    const nextYear = await AcademicYear.create({ school: f.actor.school, year: '2026-27', yearStart: 2026 });
    await Student.updateOne({ _id: f.students[0] }, {
      $push: { enrollments: { school: f.actor.school, grade: 'Grade 3', academicYearStart: 2026 } },
    });
    const otherYear = await service.loadStudentSheet(f.actor, { ...f.scope, academicYear: String(nextYear._id) });
    assert.ok(otherYear.rows.every((row) => row.regularLevel === null));
    const subject = await Subject.create({ school: f.actor.school, grade: 'Grade 3', code: 'ENG', titleEn: 'English' });
    await Outcome.create({
      school: f.actor.school, grade: 'Grade 3', subject: subject._id, subjectCode: 'ENG', code: 'E1',
      themeNe: 'म र मेरो परिवार', themeEn: 'My family', titleEn: 'Identifies family members',
    });
    const otherSubject = await service.loadStudentSheet(f.actor, { ...f.scope, subject: String(subject._id) });
    assert.ok(otherSubject.rows.every((row) => row.regularLevel === null));
  });

  it('rejects an invalid later row without saving an earlier valid row', async () => {
    const f = await fixture();
    const input = f.payload();
    input.rows[1].remedialLevel = 3;
    input.rows[1].remedialDate = '2025-05-09';
    await assert.rejects(service.saveSheet(f.actor, input), CasDateError);
    assert.equal(await Assessment.countDocuments({ school: f.actor.school }), 0);
  });

  it('rejects stale submissions without replacing the already saved page', async () => {
    const f = await fixture();
    const first = await service.saveSheet(f.actor, f.payload());
    const input = { ...f.scope, rows: rowsFrom(first.sheet) };
    input.rows[0].remarks = 'Saved by the first editor';
    await service.saveSheet(f.actor, input);
    input.rows[0].remarks = 'Stale overwrite';
    await assert.rejects(service.saveSheet(f.actor, input), { status: 409 });
    const reloaded = await service.loadStudentSheet(f.actor, f.scope);
    assert.equal(reloaded.rows[0].remarks, 'Saved by the first editor');
  });

  it('allows only one of two concurrent first saves and stores no duplicates', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([
      service.saveSheet(f.actor, f.payload()), service.saveSheet(f.actor, f.payload()),
    ]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find((result) => result.status === 'rejected').reason.status, 409);
    assert.equal(await Assessment.countDocuments({ school: f.actor.school }), 2);
  });

  it('edits dates, records repeated reassessments and keeps the best score for achievement', async () => {
    const f = await fixture();
    let result = await service.saveSheet(f.actor, f.payload());
    const reassess = (level, date) => {
      const rows = rowsFrom(result.sheet);
      rows[0].remedialLevel = level;
      rows[0].remedialDate = date;
      return service.saveSheet(f.actor, { ...f.scope, rows });
    };

    let rows = rowsFrom(result.sheet);
    rows[0].regularDate = '2025-05-09';
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    let stored = await Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();
    assert.equal(stored.attempts[0].assessmentDate, '2025-05-09');
    assert.equal(stored.attempts[0].revisions[0].assessmentDate, '2025-05-10');

    // A weaker reassessment is saved for history, but the accepted score stays on the higher result.
    result = await reassess(1, '2025-05-11');
    assert.equal(result.sheet.rows[0].acceptedLevel, 2);
    assert.equal(result.sheet.totals.obtained, 4);

    // Editing only the date corrects the visible latest attempt rather than appending a fake attempt.
    result = await reassess(1, '2025-05-12');
    stored = await Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();
    assert.deepEqual(stored.attempts.map((attempt) => attempt.level), [2, 1]);
    assert.equal(stored.attempts[1].assessmentDate, '2025-05-12');
    assert.equal(stored.attempts[1].revisions[0].assessmentDate, '2025-05-11');

    // Changing the score on a later date is a new reassessment.
    result = await reassess(3, '2025-05-13');
    assert.equal(result.sheet.rows[0].acceptedLevel, 3);
    assert.equal(result.sheet.rows[0].canReassess, true);
    assert.equal(result.sheet.totals.obtained, 5);

    // A lower later reassessment is kept, but achievement still uses the best score reached.
    result = await reassess(2, '2025-05-14');
    assert.equal(result.sheet.rows[0].acceptedLevel, 3);
    assert.equal(result.sheet.rows[0].remedialLevel, 2);
    assert.equal(result.sheet.totals.obtained, 5);

    result = await reassess(4, '2025-05-15');
    assert.equal(result.sheet.rows[0].acceptedLevel, 4);
    assert.equal(result.sheet.rows[0].canReassess, false);
    assert.equal(result.sheet.totals.obtained, 6);
    stored = await Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();
    assert.deepEqual(stored.attempts.map((attempt) => attempt.level), [2, 1, 3, 2, 4]);

    rows = rowsFrom(result.sheet);
    rows[0].regularDate = '2025-05-16';
    await assert.rejects(service.saveSheet(f.actor, { ...f.scope, rows }), { status: 409 });
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 1;
    await assert.rejects(service.saveSheet(f.actor, { ...f.scope, rows }), { status: 409 });
  });

  it('refuses reassessment after a regular 4', async () => {
    const f = await fixture();
    const top = f.payload();
    top.rows[1] = { ...top.rows[1], regularLevel: 4, regularDate: '2025-05-10', remedialLevel: 4, remedialDate: '2025-05-11' };
    await assert.rejects(service.saveSheet(f.actor, top), { status: 409 });
    assert.equal(await Assessment.countDocuments({ school: f.actor.school }), 0);
  });

  it('shows a live report card preview, then the published card, and none for an unassessed student', async () => {
    const f = await fixture();
    await mongoose.connection.db.collection('users').insertOne({
      _id: new mongoose.Types.ObjectId(f.actor.school), role: 'SCHOOL_ADMIN', schoolName: 'Test school',
    });
    await service.saveSheet(f.actor, f.payload());
    const reports = await import('../lib/casReportService.js');
    const cards = () => reports.loadGradeReportCards(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', format: 'MODERN',
    });

    let result = await cards();
    const byId = (id) => result.students.find((student) => student.id === String(id));
    assert.equal(byId(f.students[0]).status, 'PREVIEW');
    assert.equal(byId(f.students[0]).report.format, 'MODERN');
    assert.equal(byId(f.students[0]).report.snapshot.school.name, 'Test school');
    assert.equal(byId(f.students[0]).report.snapshot.subjects[0].obtained, 4);
    assert.equal(byId(f.students[1]).status, 'NOT_ASSESSED');
    assert.equal(byId(f.students[1]).report, null);
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0, 'a preview saves nothing');

    const publishFirst = () => reports.publishGradeResults(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', students: [String(f.students[0])],
      format: 'CLASSIC',
    });
    await assert.rejects(publishFirst(), /issue date/, 'nothing stands in for the exam issue date');
    const { default: Exam } = await import('@pravyo/db/models/cas/CasExam');
    await Exam.create({
      school: f.actor.school, academicYear: f.scope.academicYear, name: 'First Terminal Exam', issueDate: '2083/06/28',
    });
    await publishFirst();
    result = await cards();
    assert.equal(byId(f.students[0]).status, 'PUBLISHED');
    assert.equal(byId(f.students[0]).report.format, 'CLASSIC', 'a published card keeps its own format');
    assert.equal(byId(f.students[0]).report.snapshot.issueDate, '2083/06/28', 'the card prints the exam issue date');
    assert.equal(byId(f.students[0]).report.snapshot.examTitle, 'First Terminal Examination');
    assert.ok(new Date(byId(f.students[0]).report.publishedAt) <= new Date(), 'published immediately');
    const afterPublish = rowsFrom(await service.loadStudentSheet(f.actor, f.scope));
    afterPublish[0].remarks = 'After publishing';
    await service.saveSheet(f.actor, { ...f.scope, rows: afterPublish });

    await reports.publishGradeResults(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', students: [String(f.students[0])],
      format: 'MODERN', examTerm: 'SECOND', examTitle: 'Second Terminal Examination',
    });
    const second = await reports.loadGradeReportCards(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', format: 'MODERN', examTerm: 'SECOND',
    });
    const secondById = (id) => second.students.find((student) => student.id === String(id));
    assert.equal(secondById(f.students[0]).status, 'PUBLISHED');
    assert.equal(secondById(f.students[0]).report.format, 'MODERN');
    assert.equal(secondById(f.students[0]).report.snapshot.examTitle, 'Second Terminal Examination');
    result = await cards();
    assert.equal(byId(f.students[0]).report.format, 'CLASSIC', 'first terminal stays separate from second terminal');

    const undone = await reports.unpublishGradeResults(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', students: [String(f.students[0])],
    });
    assert.equal(undone.unpublished, 1);
    result = await cards();
    assert.equal(byId(f.students[0]).status, 'PREVIEW', 'an unpublished result is a live preview again');
    const open = rowsFrom(await service.loadStudentSheet(f.actor, f.scope));
    open[0].remarks = 'Corrected after unpublishing';
    await service.saveSheet(f.actor, { ...f.scope, rows: open });
    // A student who later leaves or transfers still has this year's result.
    await Student.collection.updateOne({ _id: f.students[0] }, { $set: { status: 'INACTIVE', school: new mongoose.Types.ObjectId() } });
    result = await cards();
    assert.equal(byId(f.students[0]).status, 'PREVIEW', 'a past student keeps their result in the year they were enrolled');
    const only = await reports.loadGradeReportCards(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', students: [String(f.students[1])],
    });
    assert.deepEqual(only.students.map((student) => student.id), [String(f.students[1])]);
  });

  it('saves one student attendance and activities, then a whole grade', async () => {
    const f = await fixture();
    const records = await import('../lib/casStudentRecordService.js');
    const base = { academicYear: f.scope.academicYear, grade: 'Grade 3' };
    await records.saveStudentRecord(f.actor, {
      ...base, student: String(f.students[0]), revision: 0,
      attendance: { workingDays: 100, presentDays: 95 },
      extraActivities: { discipline: 'A' },
    });
    const { students } = await records.loadStudentRecords(f.actor, base);
    const first = students.find((row) => row.student.id === String(f.students[0]));
    assert.deepEqual(first.attendance, { workingDays: 100, presentDays: 95, absentDays: 5 });
    assert.equal(first.extraActivities.discipline, 'A');

    // Saved extra activities stay as they are; the rest of the grade fills theirs.
    const isFirst = (row) => row.student.id === String(f.students[0]);
    await records.saveStudentRecords(f.actor, {
      ...base,
      rows: students.map((row) => ({
        student: row.student.id, revision: row.revision,
        attendance: { workingDays: 112, presentDays: 110 },
        extraActivities: isFirst(row) ? row.extraActivities : { eca: 'B+' },
      })),
    });
    const after = await records.loadStudentRecords(f.actor, base);
    assert.ok(after.students.every((row) => row.attendance.presentDays === 110 &&
      (isFirst(row) ? row.extraActivities.discipline === 'A' : row.extraActivities.eca === 'B+')));

    await assert.rejects(
      records.saveStudentRecords(f.actor, {
        ...base,
        rows: after.students.map((row) => ({
          student: row.student.id, revision: row.revision,
          attendance: row.attendance,
          extraActivities: { ...row.extraActivities, eca: 'C' },
        })),
      }),
      /already saved for this exam/,
    );
  });

  it('rejects clearing an already recorded mark and permits a no-change resubmission', async () => {
    const f = await fixture();
    const first = await service.saveSheet(f.actor, f.payload());
    const same = await service.saveSheet(f.actor, { ...f.scope, rows: rowsFrom(first.sheet) });
    assert.equal(same.saved, 0);
    const rows = rowsFrom(same.sheet);
    rows[0].regularLevel = null;
    rows[0].regularDate = '';
    await assert.rejects(service.saveSheet(f.actor, { ...f.scope, rows }), { status: 409 });
  });

  it('rejects school, enrollment, subject and theme mismatches before writing', async () => {
    const f = await fixture();
    const foreign = await fixture();
    await assert.rejects(service.loadStudentSheet(foreign.actor, f.scope), { status: 404 });
    await assert.rejects(service.saveSheet(foreign.actor, f.payload()), { status: 404 });
    await assert.rejects(service.saveSheet(f.actor, f.payload({ student: String(foreign.students[0]) })), { status: 404 });
    await assert.rejects(service.saveSheet(f.actor, f.payload({ grade: 'Grade 9' })));
    await assert.rejects(service.saveSheet(f.actor, f.payload({ themeKey: 'Other theme|' })));
    const wrongOutcome = f.payload();
    wrongOutcome.rows[1].outcome = String(foreign.outcomes[0]._id);
    await assert.rejects(service.saveSheet(f.actor, wrongOutcome));
    await Student.updateOne({ _id: f.students[0] }, { $set: { enrollments: [] } });
    await assert.rejects(service.saveSheet(f.actor, f.payload()), { status: 409 });
    assert.equal(await Assessment.countDocuments({ school: f.actor.school }), 0);
  });

  it('keeps published snapshots fixed while later sheet writes continue', async () => {
    const f = await fixture();
    const first = await service.saveSheet(f.actor, f.payload());
    await Report.create({
      school: f.actor.school, academicYear: f.year._id, student: f.students[0], grade: 'Grade 3',
      status: 'PUBLISHED', snapshot: {}, publishedAt: new Date(),
    });
    assert.equal((await service.loadStudentSheet(f.actor, f.scope)).locked, false);
    const rows = rowsFrom(first.sheet);
    rows[0].remarks = 'Continue after first terminal';
    await service.saveSheet(f.actor, { ...f.scope, rows });
    assert.equal((await service.loadStudentSheet(f.actor, f.scope)).rows[0].remarks, 'Continue after first terminal');
  });

  it('permits an assigned teacher to write the shared sheet and denies an unassigned teacher', async () => {
    const f = await fixture();
    const teacher = { ...f.actor, id: String(id()), role: 'TEACHER' };
    const unassignedTeacher = { ...f.actor, id: String(id()), role: 'TEACHER' };
    await TeacherAssignment.create({
      school: f.actor.school, academicYear: f.year._id, exam: f.exam._id,
      grade: 'Grade 3', subject: f.subject._id, teacher: teacher.id, assignedBy: f.actor.id,
    });
    assert.equal((await service.loadStudentSheet(teacher, f.scope)).canRecord, true);
    await assert.rejects(service.loadStudentSheet(unassignedTeacher, f.scope), { status: 403 });
    const saved = await service.saveSheet(teacher, f.payload());
    assert.equal(saved.saved, 2);
    const stored = await Assessment.findOne({ school: f.actor.school, student: f.students[0] }).lean();
    assert.equal(String(stored.attempts[0].recordedBy), teacher.id);
    await assert.rejects(service.saveSheet(unassignedTeacher, f.payload()), { status: 403 });
  });
});
