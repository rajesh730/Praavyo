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
    // An exam belongs to one academic year, so next year's page is reached through next year's exam.
    const nextYearExam = await Exam.create({ school: f.actor.school, academicYear: nextYear._id, name: 'First Terminal Examination', issueDate: '2083/06/28' });
    await ThemeExam.create({
      school: f.actor.school, academicYear: nextYear._id, exam: nextYearExam._id, grade: 'Grade 3', subject: f.subject._id, themeKey: f.scope.themeKey,
    });
    const otherYear = await service.loadStudentSheet(f.actor, { ...f.scope, academicYear: String(nextYear._id), exam: String(nextYearExam._id) });
    assert.ok(otherYear.rows.every((row) => row.regularLevel === null));
    const subject = await Subject.create({ school: f.actor.school, grade: 'Grade 3', code: 'ENG', titleEn: 'English' });
    await Outcome.create({
      school: f.actor.school, grade: 'Grade 3', subject: subject._id, subjectCode: 'ENG', code: 'E1',
      themeNe: 'म र मेरो परिवार', themeEn: 'My family', titleEn: 'Identifies family members',
    });
    await ThemeExam.create({
      school: f.actor.school, academicYear: f.year._id, exam: f.exam._id, grade: 'Grade 3', subject: subject._id, themeKey: f.scope.themeKey,
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

    // Before publishing, a mistyped regular score is corrected in place; the
    // replaced value is kept on the attempt.
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 1;
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    stored = await Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();
    assert.deepEqual(stored.attempts.map((attempt) => attempt.level), [1, 1, 3, 2, 4]);
    assert.equal(stored.attempts[0].revisions.at(-1).level, 2);
    assert.equal(result.sheet.rows[0].regularLevel, 1);
  });

  it('corrects and clears mistaken scores until the result is published, keeping an audit trail', async () => {
    const f = await fixture();
    let result = await service.saveSheet(f.actor, f.payload());
    const stored = () => Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();

    // Regular 2 -> 3 is a correction, not a reassessment: it may also lower.
    let rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 3;
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    assert.equal(result.sheet.rows[0].acceptedLevel, 3);
    assert.deepEqual((await stored()).attempts.map((attempt) => attempt.level), [3]);
    assert.equal((await stored()).attempts[0].revisions[0].level, 2);

    // Extra support on a 3, then the regular is corrected to 4: the
    // extra-support score must be cleared, and is kept in removedAttempts.
    rows = rowsFrom(result.sheet);
    rows[0].remedialLevel = 4;
    rows[0].remedialDate = '2025-05-12';
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 4;
    await assert.rejects(service.saveSheet(f.actor, { ...f.scope, rows }), { status: 409, message: /scored 4/ });
    rows[0].remedialLevel = null;
    rows[0].remedialDate = '';
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    assert.equal(result.sheet.rows[0].remedialLevel, null);
    assert.equal(result.sheet.rows[0].acceptedLevel, 4);
    assert.deepEqual((await stored()).removedAttempts.map((attempt) => [attempt.attemptType, attempt.level]), [['REASSESSMENT', 4]]);

    // Clearing the regular score leaves the outcome unassessed again.
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = null;
    rows[0].regularDate = '';
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    assert.equal(result.sheet.rows[0].regularLevel, null);
    assert.equal(result.sheet.rows[0].acceptedLevel, null);
    assert.equal(result.sheet.totals.assessedCount, 1);
    const cleared = await stored();
    assert.deepEqual(cleared.attempts, []);
    assert.equal(cleared.acceptedLevel, null);
    assert.equal(cleared.removedAttempts.length, 2);
    assert.equal(cleared.removedAttempts[1].removedByName, 'Test school');

    // It can be scored again afterwards.
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 2;
    rows[0].regularDate = '2025-05-13';
    result = await service.saveSheet(f.actor, { ...f.scope, rows });
    assert.equal(result.sheet.rows[0].acceptedLevel, 2);

    // Once the exam's card is published, nothing can be corrected.
    await Report.create({
      school: f.actor.school, academicYear: f.year._id, student: f.students[0], grade: 'Grade 3',
      exam: f.exam._id, status: 'PUBLISHED', snapshot: {}, publishedAt: new Date(),
    });
    rows = rowsFrom(result.sheet);
    rows[0].regularLevel = 4;
    await assert.rejects(service.saveSheet(f.actor, { ...f.scope, rows }), { status: 409, message: /published/ });
  });

  it('counts each student’s entered marks for an exam (green / yellow / red in Assessment)', async () => {
    const f = await fixture();
    const scope = { academicYear: f.scope.academicYear, grade: 'Grade 3', subject: f.scope.subject, exam: f.scope.exam };
    let progress = await service.examMarkProgress(f.actor, scope);
    assert.equal(progress.total, 2);
    assert.equal(progress.assessedFor(f.students[0]), 0);

    const partial = f.payload();
    partial.rows[1] = { ...partial.rows[1], regularLevel: null, regularDate: '' };
    await service.saveSheet(f.actor, partial);
    progress = await service.examMarkProgress(f.actor, scope);
    assert.equal(progress.assessedFor(f.students[0]), 1);

    await service.saveSheet(f.actor, f.payload({ student: String(f.students[1]) }));
    progress = await service.examMarkProgress(f.actor, scope);
    assert.equal(progress.assessedFor(f.students[1]), 2);

    // A cleared score no longer counts.
    const sheet = await service.loadStudentSheet(f.actor, { ...f.scope, student: String(f.students[1]) });
    const rows = rowsFrom(sheet);
    rows[0] = { ...rows[0], regularLevel: null, regularDate: '' };
    await service.saveSheet(f.actor, { ...f.scope, student: String(f.students[1]), rows });
    progress = await service.examMarkProgress(f.actor, scope);
    assert.equal(progress.assessedFor(f.students[1]), 1);

    // A teacher sees counts only for an exam and subject assigned to them.
    const teacher = { ...f.actor, id: String(id()), role: 'TEACHER' };
    await assert.rejects(service.examMarkProgress(teacher, scope), { status: 403 });
    await TeacherAssignment.create({
      school: f.actor.school, academicYear: f.year._id, exam: f.exam._id,
      grade: 'Grade 3', subject: f.subject._id, teacher: teacher.id, assignedBy: f.actor.id,
    });
    assert.equal((await service.examMarkProgress(teacher, scope)).total, 2);
  });

  it('refuses reassessment after a regular 4', async () => {
    const f = await fixture();
    const top = f.payload();
    top.rows[1] = { ...top.rows[1], regularLevel: 4, regularDate: '2025-05-10', remedialLevel: 4, remedialDate: '2025-05-11' };
    await assert.rejects(service.saveSheet(f.actor, top), { status: 409 });
    assert.equal(await Assessment.countDocuments({ school: f.actor.school }), 0);
  });

  it('previews a result, publishes it only for the whole grade, and completes missing marks only on "Publish anyway"', async () => {
    const f = await fixture();
    await mongoose.connection.db.collection('users').insertOne({
      _id: new mongoose.Types.ObjectId(f.actor.school), role: 'SCHOOL_ADMIN', schoolName: 'Test school',
    });
    // A second subject in the same exam, both weighted, so the GPA can show
    // that a "Not attended exam" subject is left out of it.
    await Subject.updateOne({ _id: f.subject._id }, { $set: { creditHours: 4 } });
    const english = await Subject.create({ school: f.actor.school, grade: 'Grade 3', code: 'ENG', titleEn: 'English', creditHours: 4 });
    await Outcome.create({
      school: f.actor.school, grade: 'Grade 3', subject: english._id, subjectCode: 'ENG', code: 'E1',
      themeKey: 'eng-1', themeEn: 'Greetings', titleEn: 'Greets people', sequence: 1,
    });
    await ThemeExam.create({
      school: f.actor.school, academicYear: f.year._id, exam: f.exam._id, grade: 'Grade 3', subject: english._id, themeKey: 'eng-1',
    });
    const themeAssignmentIds = (await ThemeExam.find({ school: f.actor.school, exam: f.exam._id }).select('_id').lean()).map((row) => String(row._id));
    // Student 1 is assessed in Nepali only; student 2 in nothing.
    await service.saveSheet(f.actor, f.payload());
    const reports = await import('../lib/casReportService.js');
    const scope = {
      academicYear: f.scope.academicYear, grade: 'Grade 3', format: 'CLASSIC', examId: f.scope.exam, themeAssignmentIds,
    };
    const cards = () => reports.loadGradeReportCards(f.actor, scope);

    let result = await cards();
    const byId = (id) => result.students.find((student) => student.id === String(id));
    assert.equal(byId(f.students[0]).status, 'PREVIEW');
    assert.equal(byId(f.students[0]).report.snapshot.school.name, 'Test school');
    const subjectNamed = (snapshot, title) => snapshot.subjects.find((subject) => subject.titleEn === title);
    assert.equal(subjectNamed(byId(f.students[0]).report.snapshot, 'Nepali').obtained, 4);
    assert.equal(byId(f.students[1]).status, 'NOT_ASSESSED');
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0, 'a preview saves nothing');

    // Publishing is for the whole grade only: no student list is accepted.
    await assert.rejects(reports.publishGradeResults(f.actor, { ...scope, students: [String(f.students[0])] }));

    // The check lists every missing subject mark, student by student.
    const check = await reports.publishGradeResults(f.actor, { ...scope, checkOnly: true });
    assert.equal(check.total, 2);
    assert.equal(check.toPublish, 2);
    assert.equal(check.alreadyPublished, 0);
    assert.equal(check.missingStudents, 2);
    assert.deepEqual(
      check.missing.map((row) => `${row.name}:${row.subjectEn}:${row.assessed}/${row.outcomes}`).sort(),
      ['Synthetic student 1:English:0/1', 'Synthetic student 2:English:0/1', 'Synthetic student 2:Nepali:0/2'],
    );
    assert.deepEqual(check.missingWork, { missingWork: 'ABSENT', missingWorkLevel: 0 });
    assert.equal(check.issueDate, '2082/06/28');
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0, 'a check saves nothing');

    // With marks missing, publishing is refused until the school chooses "Publish anyway".
    await assert.rejects(reports.publishGradeResults(f.actor, scope), { status: 409, message: /3 subject marks are missing for 2 students/ });
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0);

    const outcome = await reports.publishGradeResults(f.actor, { ...scope, publishAnyway: true });
    assert.equal(outcome.published.length, 2, 'every student is published, the unassessed one included');
    assert.equal(outcome.completedMissing, 3);
    result = await cards();
    const first = byId(f.students[0]).report.snapshot;
    assert.equal(byId(f.students[0]).status, 'PUBLISHED');
    assert.equal(first.issueDate, '2082/06/28', 'the card prints the exam issue date');
    assert.equal(first.examTitle, 'First Terminal Examination');
    const nepali = subjectNamed(first, 'Nepali');
    const absentEnglish = subjectNamed(first, 'English');
    assert.equal(absentEnglish.absent, true);
    assert.equal(absentEnglish.remarkEn, 'Not attended exam');
    assert.equal(absentEnglish.grade, null);
    assert.equal(absentEnglish.gradePoint, null);
    assert.equal(first.gpa, nepali.gradePoint, 'a subject not attended is left out of the GPA');
    const second = byId(f.students[1]).report.snapshot;
    assert.ok(second.subjects.every((subject) => subject.absent && subject.remarkEn === 'Not attended exam'));
    assert.equal(second.gpa, null);

    await assert.rejects(reports.publishGradeResults(f.actor, scope), /already published/);

    // Unpublishing is per exam and grade, and deletes the cards outright.
    const undone = await reports.unpublishExamResults(f.actor, {
      academicYear: f.scope.academicYear, grade: 'Grade 3', exam: f.scope.exam,
    });
    assert.equal(undone.unpublished, 2);
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0, 'unpublished cards are deleted, not kept');
    result = await cards();
    assert.equal(byId(f.students[0]).status, 'PREVIEW', 'an unpublished result is a live preview again');
  });

  it('completes missing marks with the exam default level when the school chose one', async () => {
    const f = await fixture();
    await mongoose.connection.db.collection('users').insertOne({
      _id: new mongoose.Types.ObjectId(f.actor.school), role: 'SCHOOL_ADMIN', schoolName: 'Test school',
    });
    const exams = await import('../lib/casExamService.js');
    await exams.updateExam(f.actor, {
      exam: f.scope.exam, academicYear: f.scope.academicYear, name: 'First Terminal Examination',
      missingWork: 'DEFAULT_LEVEL', missingWorkLevel: 0,
    });
    const listed = (await exams.listExams(f.actor, { academicYear: f.scope.academicYear })).exams[0];
    assert.equal(listed.missingWork, 'DEFAULT_LEVEL');
    assert.equal(listed.missingWorkLevel, 0);

    // Student 1 complete; student 2 has one of the two outcomes, scored 4.
    await service.saveSheet(f.actor, f.payload());
    const partial = f.payload({ student: String(f.students[1]) });
    partial.rows = [{ ...partial.rows[0], regularLevel: 4 }];
    await service.saveSheet(f.actor, partial);
    const reports = await import('../lib/casReportService.js');
    const scope = { academicYear: f.scope.academicYear, grade: 'Grade 3', format: 'CLASSIC', examId: f.scope.exam };

    const check = await reports.publishGradeResults(f.actor, { ...scope, checkOnly: true });
    assert.equal(check.missing.length, 1);
    assert.equal(check.missing[0].assessed, 1);
    assert.deepEqual(check.missingWork, { missingWork: 'DEFAULT_LEVEL', missingWorkLevel: 0 });

    await reports.publishGradeResults(f.actor, { ...scope, publishAnyway: true });
    const cards = await reports.loadGradeReportCards(f.actor, scope);
    const subject = cards.students.find((student) => student.id === String(f.students[1])).report.snapshot.subjects[0];
    // 4 + 0 out of 2 × 4: the missing outcome counts, scored 0.
    assert.equal(subject.assessedCount, 2);
    assert.equal(subject.obtained, 4);
    assert.equal(subject.fullMarks, 8);
    assert.equal(subject.achievement, 50);
    assert.equal(subject.filledByDefault, 1);
    assert.equal(subject.absent, undefined);
    const complete = cards.students.find((student) => student.id === String(f.students[0])).report.snapshot.subjects[0];
    assert.equal(complete.filledByDefault, undefined, 'a complete student is not touched by the rule');
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

  it('permits a no-change resubmission without writing anything', async () => {
    const f = await fixture();
    const first = await service.saveSheet(f.actor, f.payload());
    const same = await service.saveSheet(f.actor, { ...f.scope, rows: rowsFrom(first.sheet) });
    assert.equal(same.saved, 0);
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

  it('locks a student’s marks for an exam once that exam’s card is published, for teachers and the school alike', async () => {
    const f = await fixture();
    const teacher = { ...f.actor, id: String(id()), role: 'TEACHER' };
    await TeacherAssignment.create({
      school: f.actor.school, academicYear: f.year._id, exam: f.exam._id,
      grade: 'Grade 3', subject: f.subject._id, teacher: teacher.id, assignedBy: f.actor.id,
    });
    const first = await service.saveSheet(f.actor, f.payload());
    await Report.create({
      school: f.actor.school, academicYear: f.year._id, student: f.students[0], grade: 'Grade 3',
      exam: f.exam._id, status: 'PUBLISHED', snapshot: {}, publishedAt: new Date(),
    });

    const sheet = await service.loadStudentSheet(teacher, f.scope);
    assert.equal(sheet.locked, true);
    const rows = rowsFrom(first.sheet);
    rows[0].remarks = 'Changed after publishing';
    for (const actor of [teacher, f.actor]) {
      await assert.rejects(service.saveSheet(actor, { ...f.scope, rows }), { status: 409, message: /published/ });
    }
    const stored = await Assessment.findOne({ student: f.students[0], outcome: f.outcomes[0]._id }).lean();
    assert.equal(stored.sheetRemarks, '', 'a refused save writes nothing');

    // Another student, and the same student in another exam, stay open.
    const other = { ...f.scope, student: String(f.students[1]) };
    assert.equal((await service.loadStudentSheet(f.actor, other)).locked, false);
    await service.saveSheet(f.actor, f.payload({ student: String(f.students[1]) }));
    const secondExam = await Exam.create({ school: f.actor.school, academicYear: f.year._id, name: 'Second Terminal Examination' });
    await ThemeExam.create({
      school: f.actor.school, academicYear: f.year._id, exam: secondExam._id, grade: 'Grade 3',
      subject: f.subject._id, themeKey: f.scope.themeKey,
    });
    const nextExam = { ...f.scope, exam: String(secondExam._id) };
    assert.equal((await service.loadStudentSheet(f.actor, nextExam)).locked, false);
    await service.saveSheet(f.actor, f.payload({ exam: String(secondExam._id) }));

    // Unpublishing the exam for the grade unlocks it again.
    const reports = await import('../lib/casReportService.js');
    await reports.unpublishExamResults(f.actor, { academicYear: f.scope.academicYear, grade: 'Grade 3', exam: f.scope.exam });
    assert.equal((await service.loadStudentSheet(teacher, f.scope)).locked, false);
    await service.saveSheet(teacher, { ...f.scope, rows });
  });

  it('publishes and unpublishes a whole exam for a grade from Manage Exams', async () => {
    const f = await fixture();
    await mongoose.connection.db.collection('users').insertOne({
      _id: new mongoose.Types.ObjectId(f.actor.school), role: 'SCHOOL_ADMIN', schoolName: 'Test school',
    });
    const reports = await import('../lib/casReportService.js');
    const scope = { academicYear: f.scope.academicYear, grade: 'Grade 3', exam: f.scope.exam };

    // Only one student assessed: the summary lists the other's missing marks,
    // and publishing is refused until they are entered (or "Publish anyway").
    await service.saveSheet(f.actor, f.payload());
    const incomplete = await reports.loadExamPublishing(f.actor, scope);
    assert.equal(incomplete.total, 2);
    assert.equal(incomplete.toPublish, 2);
    assert.deepEqual(incomplete.missing.map((row) => row.student), [String(f.students[1])]);
    await assert.rejects(reports.changeExamPublishing(f.actor, { ...scope, action: 'publish' }), { status: 409, message: /missing for 1 student/ });
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0);

    await service.saveSheet(f.actor, f.payload({ student: String(f.students[1]) }));
    const summary = await reports.loadExamPublishing(f.actor, scope);
    assert.equal(summary.toPublish, 2);
    assert.deepEqual(summary.missing, []);

    const published = await reports.changeExamPublishing(f.actor, { ...scope, action: 'publish' });
    assert.equal(published.published, 2, 'the whole grade goes out together');
    const status = await reports.loadExamPublishing(f.actor, { academicYear: scope.academicYear, grade: 'Grade 3' });
    assert.equal(status.students, 2);
    assert.deepEqual(status.exams, [{ exam: scope.exam, published: 2 }]);
    assert.equal((await service.loadStudentSheet(f.actor, f.scope)).locked, true);
    await assert.rejects(reports.changeExamPublishing(f.actor, { ...scope, action: 'publish' }), /already published/);

    // Its themes are fixed while it is published.
    const exams = await import('../lib/casExamService.js');
    const subject2 = await Subject.create({ school: f.actor.school, grade: 'Grade 3', code: 'ENG', titleEn: 'English' });
    await Outcome.create({
      school: f.actor.school, grade: 'Grade 3', subject: subject2._id, subjectCode: 'ENG', code: 'E1',
      themeKey: 'eng-1', themeEn: 'Greetings', titleEn: 'Greets people',
    });
    await assert.rejects(exams.assignThemeExams(f.actor, {
      academicYear: scope.academicYear, grade: 'Grade 3', subject: String(subject2._id), themeKey: 'eng-1', examIds: [scope.exam],
    }), { status: 409, message: /Unpublish/ });

    const unpublished = await reports.changeExamPublishing(f.actor, { ...scope, action: 'unpublish' });
    assert.equal(unpublished.unpublished, 2);
    assert.equal(await Report.countDocuments({ school: f.actor.school }), 0, 'unpublishing deletes the cards');
    assert.equal((await service.loadStudentSheet(f.actor, f.scope)).locked, false);
  });

  it('keeps one current exam per academic year, never an archived one', async () => {
    const f = await fixture();
    const exams = await import('../lib/casExamService.js');
    const second = await Exam.create({ school: f.actor.school, academicYear: f.year._id, name: 'Second Terminal Examination' });
    const list = async () => (await exams.listExams(f.actor, { academicYear: f.scope.academicYear, includeArchived: true })).exams;
    const current = async () => (await list()).filter((exam) => exam.isCurrent).map((exam) => exam.name);

    assert.deepEqual(await current(), []);
    await exams.setCurrentExam(f.actor, { exam: f.scope.exam });
    assert.deepEqual(await current(), ['First Terminal Examination']);
    await exams.setCurrentExam(f.actor, { exam: String(second._id), current: true });
    assert.deepEqual(await current(), ['Second Terminal Examination'], 'marking another exam moves the mark');
    await exams.setCurrentExam(f.actor, { exam: String(second._id), current: false });
    assert.deepEqual(await current(), []);

    const teacher = { ...f.actor, id: String(id()), role: 'TEACHER' };
    await assert.rejects(exams.setCurrentExam(teacher, { exam: f.scope.exam }), { status: 403 });

    await exams.setCurrentExam(f.actor, { exam: String(second._id) });
    await exams.deleteExam(f.actor, { exam: String(second._id) });
    assert.deepEqual(await current(), [], 'an archived or deleted exam is no longer current');
    await service.saveSheet(f.actor, f.payload());
    await exams.deleteExam(f.actor, { exam: f.scope.exam });
    await assert.rejects(exams.setCurrentExam(f.actor, { exam: f.scope.exam }), { status: 409 });
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
