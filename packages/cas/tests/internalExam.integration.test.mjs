import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { register } from 'node:module';
import mongoose from 'mongoose';
import { startLocalMongo } from './helpers/localMongo.mjs';

// Internal Exam end to end on an isolated MongoDB: school-wide structure →
// exam → internal field marks → theory marks → results → publish.
// Opt in with CAS_TEST_MONGOD pointing at a local mongod executable.
// No .env file is loaded and no caller-provided MongoDB URI is used.
describe('internal exam flow on an isolated MongoDB replica set', {
  skip: process.env.CAS_TEST_MONGOD ? false : 'Set CAS_TEST_MONGOD to run database integration tests',
}, () => {
  let mongo;
  let service;
  let publishedResults;
  let AcademicYear, Subject, Student, User, InternalExam;
  const originalUri = process.env.MONGODB_URI;
  const id = () => new mongoose.Types.ObjectId();

  const STRUCTURE = {
    totalFullMarks: 100,
    theoryFullMarks: 50,
    internalFullMarks: 50,
    fields: [
      { id: 'fclasstest01', name: 'Class Test', fullMarks: 20 },
      { id: 'fpractical01', name: 'Practical', fullMarks: 20 },
      { id: 'fattendanc01', name: 'Attendance', fullMarks: 10 },
    ],
  };

  before(async () => {
    mongo = await startLocalMongo(process.env.CAS_TEST_MONGOD);
    process.env.MONGODB_URI = mongo.uri;
    register('./helpers/service-loader.mjs', import.meta.url);
    service = await import('../lib/internalExamService.js');
    publishedResults = await import('../lib/internalPublishedResults.js');
    [AcademicYear, Subject, Student, User, InternalExam] = await Promise.all([
      import('@pravyo/db/models/AcademicYear'), import('@pravyo/db/models/cas/CasSubject'),
      import('@pravyo/db/models/Student'), import('@pravyo/db/models/User'),
      import('@pravyo/db/models/cas/InternalExam'),
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
    await User.collection.insertOne({ _id: school, role: 'SCHOOL_ADMIN', status: 'APPROVED', schoolName: 'Synthetic School', name: 'Synthetic School', email: `${school}@example.test` });
    const actor = { id: String(school), school: String(school), role: 'SCHOOL_ADMIN', name: 'Synthetic School' };
    const year = await AcademicYear.create({ school, year: '2083', yearStart: 2083 });
    const subjects = await Subject.create([
      { school, grade: 'Grade 1', code: 'NEP', titleEn: 'Nepali', creditHours: 5 },
      { school, grade: 'Grade 1', code: 'MAT', titleEn: 'Mathematics', creditHours: 4 },
      { school, grade: 'Grade 2', code: 'ENG', titleEn: 'English', creditHours: 4 },
    ]);
    const students = [id(), id(), id()];
    await Student.collection.insertMany(students.map((_id, index) => ({
      _id, school, name: `Synthetic student ${index + 1}`, status: 'ACTIVE',
      enrollments: [{ school, grade: 'Grade 1', academicYearStart: 2083, rollNumber: String(index + 1) }],
    })));
    return { actor, year, subjects, students };
  }

  it('adds fields, takes internal then theory marks, and generates the result', async () => {
    const { actor, year, subjects, students } = await fixture();
    const [nepali, maths] = subjects;

    // 1. Assessment: no structure yet, then one school-wide structure.
    assert.equal((await service.getScheme(actor)).scheme, null);
    await assert.rejects(
      service.saveScheme(actor, { revision: 0, default: { ...STRUCTURE, fields: [...STRUCTURE.fields, { id: 'fextra00001', name: 'Extra', fullMarks: 5 }] } }),
      /Remove 5 marks/,
      'fields may not add up to more than the internal marks',
    );
    await assert.rejects(
      service.saveScheme(actor, { revision: 0, default: { ...STRUCTURE, totalFullMarks: 90 } }),
      /not the total of 90/,
      'TH + INT must equal the full marks',
    );
    const saved = await service.saveScheme(actor, { revision: 0, default: STRUCTURE, subjects: [] });
    assert.equal(saved.scheme.default.totalFullMarks, 100);
    assert.deepEqual(saved.scheme.default.fields.map((field) => field.name), ['Class Test', 'Practical', 'Attendance']);

    // 2. Exams: a Grade 1 Second Terminal exam, and a Grade 2 one using the same structure.
    const created = await service.createExam(actor, { academicYear: String(year._id), grade: 'Grade 1', name: 'Second Terminal Examination', issueDate: '2083/07/15' });
    const exam = created.exam || created;
    const other = await service.createExam(actor, { academicYear: String(year._id), grade: 'Grade 2', name: 'Second Terminal Examination' });
    const otherSheet = await service.loadSheet(actor, { exam: (other.exam || other).id });
    assert.deepEqual(otherSheet.subjects[0].columns.map((column) => `${column.label}/${column.fullMarks}`), ['TH/50', 'Class Test/20', 'Practical/20', 'Attendance/10']);

    let sheet = await service.loadSheet(actor, { exam: exam.id });
    assert.equal(sheet.students.length, 3);
    assert.deepEqual(sheet.subjects.map((subject) => subject.titleEn).sort(), ['Mathematics', 'Nepali']);
    assert.deepEqual(sheet.subjects[0].columns.map((column) => `${column.label}/${column.fullMarks}`), ['TH/50', 'Class Test/20', 'Practical/20', 'Attendance/10']);

    // 3. Internal field marks first: [Class Test, Practical, Attendance] per student and subject.
    const internalMarks = {
      [students[0]]: { [nepali._id]: [19, 18, 10], [maths._id]: [17, 19, 9] },
      [students[1]]: { [nepali._id]: [15, 14, 8], [maths._id]: [12, 13, 7] },
      [students[2]]: { [nepali._id]: [6, 7, 5], [maths._id]: [5, 4, 3] },
    };
    const internalEntries = [];
    for (const [student, bySubject] of Object.entries(internalMarks)) {
      for (const [subject, marks] of Object.entries(bySubject)) {
        STRUCTURE.fields.forEach((field, index) => internalEntries.push({ student, subject, internal: { [field.id]: marks[index] } }));
      }
    }
    await service.saveMarks(actor, { exam: exam.id, entries: internalEntries });
    sheet = await service.loadSheet(actor, { exam: exam.id });
    const line = (result, title) => result.subjects.find((item) => item.titleEn === title);
    const halfway = sheet.students.find((student) => student.id === String(students[0])).result;
    assert.equal(line(halfway, 'Nepali').internal.obtained, 47, 'INT is the sum of the fields');
    assert.equal(line(halfway, 'Nepali').entered, false, 'no result until theory is in');

    // A mark above its full marks is refused.
    await assert.rejects(service.saveMarks(actor, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(nepali._id), theory: 60 }] }));
    await assert.rejects(service.saveMarks(actor, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(nepali._id), internal: { fattendanc01: 11 } }] }));

    // 4. Theory marks.
    const theory = {
      [students[0]]: { [nepali._id]: 46, [maths._id]: 44.5 },
      [students[1]]: { [nepali._id]: 33, [maths._id]: 28 },
      [students[2]]: { [nepali._id]: 12, [maths._id]: 9 },
    };
    await service.saveMarks(actor, {
      exam: exam.id,
      entries: Object.entries(theory).flatMap(([student, bySubject]) => Object.entries(bySubject).map(([subject, value]) => ({ student, subject: String(subject), theory: value }))),
    });

    // 5. Result: TH + INT = total, graded on the percentage.
    sheet = await service.loadSheet(actor, { exam: exam.id });
    const resultOf = (index) => sheet.students.find((student) => student.id === String(students[index])).result;
    const top = resultOf(0);
    assert.deepEqual(['Nepali', 'Mathematics'].map((title) => {
      const item = line(top, title);
      return [title, item.theory.obtained, item.internal.obtained, item.obtained, item.grade];
    }), [
      ['Nepali', 46, 47, 93, 'A+'],
      ['Mathematics', 44.5, 45, 89.5, 'A'],
    ]);
    assert.equal(top.obtained, 182.5);
    assert.equal(top.fullMarks, 200);
    assert.equal(top.percent, 91.25);
    assert.equal(top.gpa, 3.82); // (4.0×5 + 3.6×4) / 9
    assert.equal(line(resultOf(1), 'Nepali').obtained, 70); // 33 + 37
    assert.equal(line(resultOf(1), 'Nepali').grade, 'B+');
    assert.equal(line(resultOf(2), 'Mathematics').obtained, 21); // 9 + 12
    assert.equal(line(resultOf(2), 'Mathematics').grade, 'NG');
    assert.equal(line(resultOf(2), 'Mathematics').gradePoint, 0);

    // A structure that would orphan typed marks is refused.
    await assert.rejects(
      service.saveScheme(actor, { revision: 1, default: { ...STRUCTURE, fields: [STRUCTURE.fields[0], { ...STRUCTURE.fields[1], fullMarks: 30 }] } }),
      /would not fit/,
    );

    // 6. Generate: preview cards, then publish.
    const cards = await service.loadCards(actor, { exam: exam.id });
    assert.equal(cards.length, 3);
    assert.equal(cards[0].preview, true);
    assert.equal(cards[0].snapshot.examTitle, 'Second Terminal Examination', 'no report title: the exam name');
    await service.updateExam(actor, { id: exam.id, reportTitle: 'Second Terminal Examination 2083' });
    assert.equal(cards.find((card) => card._id === String(students[0])).snapshot.overallGrade, top.overallGrade);
    assert.deepEqual(await service.publishExam(actor, { exam: exam.id }), { published: 3 });
    const published = await service.loadCards(actor, { exam: exam.id });
    const card = published.find((row) => row.snapshot.student.id === String(students[0])).snapshot;
    assert.equal(card.examTitle, 'Second Terminal Examination 2083', 'the report title heads the card');
    assert.equal(card.examName, 'Second Terminal Examination');
    assert.equal(card.obtained, 182.5);
    assert.deepEqual(line(card, 'Nepali').internal.fields.map((field) => [field.name, field.obtained]), [['Class Test', 19], ['Practical', 18], ['Attendance', 10]]);
    const row = await InternalExam.findById(exam.id).lean();
    assert.equal(row.markScheme.subjects[0].structure.theoryFullMarks, 50, 'the structure is frozen on publish');

    // 7. Published Results: published cards only, filtered on live details.
    const listed = (filters = {}) => publishedResults.publishedInternalCards(actor, { academicYear: String(year._id), grade: 'Grade 1', ...filters });
    const all = await listed();
    assert.deepEqual(all.map((item) => item.branding.studentRoll), ['1', '2', '3'], 'sorted by roll');
    assert.equal(all[0].branding.studentName, 'Synthetic student 1');
    assert.deepEqual((await listed({ search: 'student 2' })).map((item) => item.branding.studentRoll), ['2']);
    assert.equal((await listed({ exam: exam.id })).length, 3);
    assert.equal((await listed({ exam: (other.exam || other).id })).length, 0, 'an unpublished exam has no cards');
    assert.equal((await listed({ section: 'A' })).length, 0, 'no sections configured');
    assert.equal((await publishedResults.publishedInternalCards(actor, { ids: [all[1].id] }))[0].branding.studentRoll, '2', 'print page reads by id');
    const unpublished = await service.unpublishExam(actor, { exam: exam.id });
    assert.equal((await listed()).length, 0, 'unpublishing removes them from Published Results');

    // 8. Unpublished = editable in every way: structure, marks, activities.
    assert.equal(unpublished.followsCurrentStructure, true);
    assert.equal((await InternalExam.findById(exam.id).lean()).markScheme, null, 'follows the current structure again');
    await service.saveMarks(actor, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(nepali._id), theory: 40 }] });
    // 9. Extra activities: the default eight, each out of 10, until the school saves its own.
    const defaults = await service.getActivities(actor);
    assert.equal(defaults.saved, false);
    assert.deepEqual(defaults.fields.map((field) => `${field.name}/${field.fullMarks}`), ['Discipline/10', 'Personal Hygiene/10', 'Class Work/10', 'Home Work/10', 'ECA/10', 'Art & Craft/10', 'Handwriting/10', 'Project / Presentation/10']);

    const rowOf = (table) => table.students.find((row) => row.student.id === String(students[0]));
    const recordRow = (revision, activityMarks) => ({ student: String(students[0]), revision, attendance: { workingDays: 100, presentDays: 95 }, activityMarks });
    const first = await service.saveRecords(actor, { exam: exam.id, rows: [recordRow(0, { discipline: 9, eca: 8 })] });
    assert.equal(rowOf(first.table).activityMarks.discipline, 9);
    await assert.rejects(service.saveRecords(actor, { exam: exam.id, rows: [recordRow(rowOf(first.table).revision, { discipline: 11 })] }), /cannot be more than 10/);
    const second = await service.saveRecords(actor, { exam: exam.id, rows: [recordRow(rowOf(first.table).revision, { discipline: 7 })] });
    assert.equal(rowOf(second.table).activityMarks.discipline, 7, 'saved activities can be changed before publishing');
    assert.equal(rowOf(second.table).activityMarks.eca, 8, 'an activity left out keeps its mark');

    // The school's own list: ECA removed, Meditation added out of 5.
    const own = defaults.fields.filter((field) => field.id !== 'eca').concat({ id: 'ameditation1', name: 'Meditation', fullMarks: 5 });
    const savedList = await service.saveActivities(actor, { revision: 0, fields: own });
    assert.equal(savedList.saved, true);
    assert.equal(savedList.fields.at(-1).name, 'Meditation');
    await assert.rejects(
      service.saveActivities(actor, { revision: savedList.revision, fields: own.map((field) => (field.id === 'discipline' ? { ...field, fullMarks: 5 } : field)) }),
      /a mark of 7 is above the new 5/,
      'full marks cannot drop below a mark already entered',
    );
    const third = await service.saveRecords(actor, { exam: exam.id, rows: [recordRow(rowOf(second.table).revision, { ameditation1: 4.5 })] });
    assert.deepEqual(third.table.activities.map((field) => field.name), [...own.map((field) => field.name)]);
    assert.equal(rowOf(third.table).activityMarks.ameditation1, 4.5);
    assert.equal(Object.hasOwn(rowOf(third.table).activityMarks, 'eca'), false, 'a removed activity no longer shows');

    // The card prints each activity out of its full marks.
    const preview = (await service.loadCards(actor, { exam: exam.id })).find((card) => card._id === String(students[0])).snapshot;
    const lineOfActivity = (name) => preview.activities.find((item) => item.name === name);
    assert.deepEqual([lineOfActivity('Discipline').obtained, lineOfActivity('Discipline').fullMarks], [7, 10]);
    assert.deepEqual([lineOfActivity('Meditation').obtained, lineOfActivity('Meditation').fullMarks], [4.5, 5]);
    assert.equal(lineOfActivity('ECA'), undefined);
  });

  it('creates, edits and deletes an exam once for every grade', async () => {
    const { actor, year } = await fixture();
    const { default: SchoolConfig } = await import('@pravyo/db/models/SchoolConfig');
    await SchoolConfig.collection.insertOne({ school: new mongoose.Types.ObjectId(actor.school), grades: ['Grade 1', 'Grade 2'] });
    const academicYear = String(year._id);
    const names = async (grade) => (await service.listExams(actor, { academicYear, grade })).exams.map((row) => `${row.name}/${row.issueDate}`);

    const created = await service.createExam(actor, { academicYear, grade: 'Grade 1', name: 'First Terminal Examination' });
    assert.deepEqual(created.createdForGrades, ['Grade 1', 'Grade 2']);
    assert.deepEqual(await names('Grade 2'), ['First Terminal Examination/']);
    await assert.rejects(
      service.createExam(actor, { academicYear, grade: 'Grade 2', name: 'first terminal examination' }),
      /already exists for every grade/,
    );

    // A grade added later picks up the school's exams when its list opens.
    await SchoolConfig.collection.updateOne({ school: new mongoose.Types.ObjectId(actor.school) }, { $set: { grades: ['Grade 1', 'Grade 2', 'Grade 3'] } });
    assert.deepEqual(await names('Grade 3'), ['First Terminal Examination/']);

    // Any name the school types: no fixed term list (owner, 2026-11-20).
    const unitTest = await service.createExam(actor, { academicYear, grade: 'Grade 1', name: 'Unit Test 1' });
    assert.equal(unitTest.term, undefined);
    assert.deepEqual(await names('Grade 2'), ['First Terminal Examination/', 'Unit Test 1/']);
    await service.deleteExam(actor, { id: unitTest.id });

    // The report title is the card's heading; empty prints the exam name.
    assert.equal(created.reportTitle, '');
    await service.updateExam(actor, { id: created.id, reportTitle: 'First Terminal Examination 2083' });
    const titled = (await service.listExams(actor, { academicYear, grade: 'Grade 2' })).exams[0];
    assert.equal(titled.reportTitle, 'First Terminal Examination 2083', 'the title is shared by every grade');
    await service.updateExam(actor, { id: created.id, reportTitle: '' });

    await service.updateExam(actor, { id: created.id, name: 'First Term Exam', issueDate: '2083/07/15' });
    for (const grade of ['Grade 1', 'Grade 2', 'Grade 3']) assert.deepEqual(await names(grade), ['First Term Exam/2083/07/15']);

    // Publishing stays per grade, and a published grade blocks shared edits.
    await InternalExam.updateOne({ school: actor.school, grade: 'Grade 2' }, { $set: { publishedAt: new Date() } });
    await assert.rejects(service.updateExam(actor, { id: created.id, name: 'Renamed' }), /Unpublish its results for Grade 2/);
    await assert.rejects(service.deleteExam(actor, { id: created.id }), /Unpublish its results for Grade 2/);
    await InternalExam.updateOne({ school: actor.school, grade: 'Grade 2' }, { $set: { publishedAt: null } });

    await service.deleteExam(actor, { id: created.id });
    assert.equal(await InternalExam.countDocuments({ school: actor.school }), 0);
  });

  it('lets a subject teacher (Teachers page) enter only their subject, theory and internal', async () => {
    const { actor, year, subjects, students } = await fixture();
    const [nepali, maths] = subjects;
    const academicYear = String(year._id);
    const teacherId = id();
    const otherId = id();
    await mongoose.connection.collection('teachers').insertMany([
      { _id: teacherId, name: 'Synthetic Teacher', email: `${teacherId}@example.test` },
      { _id: otherId, name: 'Other Teacher', email: `${otherId}@example.test` },
    ]);
    await mongoose.connection.collection('teachermemberships').insertMany([
      { teacher: teacherId, school: new mongoose.Types.ObjectId(actor.school), status: 'ACTIVE' },
      { teacher: otherId, school: new mongoose.Types.ObjectId(actor.school), status: 'ACTIVE' },
    ]);
    const teacher = { id: String(teacherId), school: actor.school, role: 'TEACHER', name: 'Synthetic Teacher' };
    const exam = await service.createExam(actor, { academicYear, grade: 'Grade 1', name: 'First Terminal Examination' });
    const teaching = mongoose.connection.collection('teacherteachingassignments');
    const school = new mongoose.Types.ObjectId(actor.school);
    // A class teacher row alone opens nothing.
    await teaching.insertOne({ school, teacher: teacherId, grade: 'Grade 1', assignmentType: 'CLASS_TEACHER', subject: null });

    // Nothing assigned: no grades, no exams, no sheet.
    assert.deepEqual(await service.listExamGrades(teacher), []);
    assert.deepEqual((await service.listExams(teacher, { academicYear, grade: 'Grade 1' })).exams, []);
    await assert.rejects(service.loadSheet(teacher, { exam: exam.id }), /not assigned you a subject/);

    // The Teachers page makes them the Grade 1 Nepali teacher: that is the
    // whole of their access, in every exam of the grade.
    await teaching.insertOne({ school, teacher: teacherId, grade: 'Grade 1', assignmentType: 'SUBJECT_TEACHER', subject: nepali._id });
    const panel = await service.listExamTeachers(actor, { exam: exam.id });
    assert.deepEqual(panel.subjects.find((row) => row.id === String(nepali._id)).teachers.map((row) => row.name), ['Synthetic Teacher']);
    assert.deepEqual(panel.subjects.find((row) => row.id === String(maths._id)).teachers, []);
    assert.deepEqual(await service.listExamGrades(teacher), ['Grade 1']);
    assert.deepEqual((await service.listExams(teacher, { academicYear, grade: 'Grade 1' })).exams.map((row) => row.id), [exam.id]);

    // The sheet holds Nepali only; Mathematics is neither shown nor savable.
    const sheet = await service.loadSheet(teacher, { exam: exam.id });
    assert.deepEqual(sheet.subjects.map((row) => row.titleEn), ['Nepali']);
    assert.equal(sheet.subjects[0].canEdit, true);
    await service.saveMarks(teacher, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(nepali._id), marks: 40 }] });
    await assert.rejects(
      service.saveMarks(teacher, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(maths._id), marks: 40 }] }),
      /not assigned to enter Mathematics/,
    );
    // Internal / practical marks follow the same rule as theory.
    await service.saveScheme(actor, { revision: 0, default: STRUCTURE, subjects: [] });
    const withInternal = await service.loadSheet(teacher, { exam: exam.id });
    assert.deepEqual(withInternal.subjects.map((row) => row.titleEn), ['Nepali'], 'internal tab lists only their subject too');
    await service.saveMarks(teacher, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(nepali._id), internal: { fclasstest01: 15 } }] });
    await assert.rejects(
      service.saveMarks(teacher, { exam: exam.id, entries: [{ student: String(students[0]), subject: String(maths._id), internal: { fclasstest01: 15 } }] }),
      /not assigned to enter Mathematics/,
    );
    assert.equal((await service.loadSheet(actor, { exam: exam.id })).marks[String(students[0])][String(nepali._id)].internal.fclasstest01, 15);

    // The school reads the teacher's mark on its own sheet: one set of records.
    const schoolSheet = await service.loadSheet(actor, { exam: exam.id });
    assert.equal(schoolSheet.marks[String(students[0])][String(nepali._id)].theory, 40);

    // A second exam needs no setup: the subject teacher has it at once.
    const second = await service.createExam(actor, { academicYear, grade: 'Grade 1', name: 'Second Terminal Examination' });
    assert.deepEqual((await service.loadSheet(teacher, { exam: second.id })).subjects.map((row) => row.titleEn), ['Nepali']);

    // Another teacher with no subject gets nothing; removing the subject on the
    // Teachers page removes access at once.
    await assert.rejects(service.loadSheet({ ...teacher, id: String(otherId) }, { exam: exam.id }), /not assigned you a subject/);
    await teaching.deleteOne({ teacher: teacherId, assignmentType: 'SUBJECT_TEACHER' });
    await assert.rejects(service.loadSheet(teacher, { exam: exam.id }), /not assigned you a subject/);
    assert.equal((await service.loadSheet(actor, { exam: exam.id })).marks[String(students[0])][String(nepali._id)].theory, 40, 'marks stay');
  });

  it('shows a section only when the school has configured it for the grade', async () => {
    const { actor, year, students } = await fixture();
    const { default: SchoolConfig } = await import('@pravyo/db/models/SchoolConfig');
    // A stale section left on an enrollment of a grade with no sections.
    await Student.collection.updateOne({ _id: students[0] }, { $set: { 'enrollments.0.section': 'A' } });
    const created = await service.createExam(actor, { academicYear: String(year._id), grade: 'Grade 1', name: 'First Terminal Examination' });
    const exam = created.exam || created;
    const sectionOf = async () => (await service.loadSheet(actor, { exam: exam.id })).students.find((row) => row.id === String(students[0])).section;

    assert.equal(await sectionOf(), '', 'no sections configured: none shows');
    await SchoolConfig.collection.insertOne({ school: new mongoose.Types.ObjectId(actor.school), gradeSections: [{ grade: 'Grade 1', sections: ['A', 'B'] }] });
    assert.equal(await sectionOf(), 'A', 'configured: it shows');
    await SchoolConfig.collection.updateOne({ school: new mongoose.Types.ObjectId(actor.school) }, { $set: { gradeSections: [{ grade: 'Grade 1', sections: ['B'] }] } });
    assert.equal(await sectionOf(), '', 'removed from the grade: it no longer shows');
  });
});
