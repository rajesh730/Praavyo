import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { register } from 'node:module';
import mongoose from 'mongoose';
import { startLocalMongo } from './helpers/localMongo.mjs';

describe('curriculum theme management on an isolated MongoDB replica set', {
  skip: process.env.CAS_TEST_MONGOD ? false : 'Set CAS_TEST_MONGOD to run database integration tests',
}, () => {
  let mongo;
  let service;
  let Subject, Outcome, Assessment, AcademicYear, Exam, ThemeExam;
  const originalUri = process.env.MONGODB_URI;
  const id = () => new mongoose.Types.ObjectId();

  before(async () => {
    mongo = await startLocalMongo(process.env.CAS_TEST_MONGOD);
    process.env.MONGODB_URI = mongo.uri;
    register('./helpers/service-loader.mjs', import.meta.url);
    service = await import('../lib/casCurriculumService.js');
    [Subject, Outcome, Assessment, AcademicYear, Exam, ThemeExam] = await Promise.all([
      import('@pravyo/db/models/cas/CasSubject'),
      import('@pravyo/db/models/cas/CasLearningOutcome'),
      import('@pravyo/db/models/cas/CasAssessment'),
      import('@pravyo/db/models/AcademicYear'),
      import('@pravyo/db/models/cas/CasExam'),
      import('@pravyo/db/models/cas/CasThemeExam'),
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
    const actor = {
      id: String(school),
      school: String(school),
      role: 'SCHOOL_ADMIN',
      name: 'Test school',
    };
    const subject = await Subject.create({
      school,
      grade: 'Grade 3',
      code: 'ENG',
      titleEn: 'English',
    });
    const academicYear = await AcademicYear.create({ school, year: '2026-27', yearStart: 2026 });
    return { actor, subject, academicYear };
  }

  it('creates, renames and deletes an unassessed theme with its rows', async () => {
    const f = await fixture();
    const theme = await service.createTheme(f.actor, {
      subject: String(f.subject._id),
      titleEn: 'Oral communication',
      titleNe: '',
      workingHours: 8,
    });
    assert.equal(theme.outcomeCount, 0);

    const outcome = await service.createOutcome(f.actor, {
      subject: String(f.subject._id),
      themeKey: theme.key,
      titleEn: 'Speaks clearly in a short conversation',
      titleNe: '',
    });
    assert.equal(outcome.themeKey, theme.key);
    assert.equal(outcome.themeEn, 'Oral communication');

    const renamed = await service.updateTheme(f.actor, {
      subject: String(f.subject._id),
      themeKey: theme.key,
      titleEn: 'Speaking',
      workingHours: 10,
    });
    assert.equal(renamed.titleEn, 'Speaking');
    assert.equal(renamed.workingHours, 10);
    assert.equal(
      (await Outcome.findById(outcome.id).lean()).themeEn,
      'Speaking',
    );

    const removed = await service.deleteTheme(f.actor, {
      subject: String(f.subject._id),
      themeKey: theme.key,
    });
    assert.deepEqual(removed, { archived: false, retainedAssessments: 0 });
    assert.equal(await Outcome.countDocuments({ _id: outcome.id }), 0);
  });

  it('archives a theme with assessed rows instead of erasing history', async () => {
    const f = await fixture();
    const theme = await service.createTheme(f.actor, {
      subject: String(f.subject._id),
      titleEn: 'Reading',
      titleNe: '',
      workingHours: null,
    });
    const outcome = await service.createOutcome(f.actor, {
      subject: String(f.subject._id),
      themeKey: theme.key,
      titleEn: 'Reads a simple instruction',
      titleNe: '',
    });
    await Assessment.create({
      school: f.actor.school,
      academicYear: id(),
      grade: 'Grade 3',
      student: id(),
      studentName: 'Synthetic student',
      subject: f.subject._id,
      subjectCode: 'ENG',
      outcome: outcome.id,
      outcomeCode: outcome.code,
      attempts: [{
        attemptType: 'INITIAL',
        attemptNumber: 1,
        level: 3,
        assessmentDate: '2026-05-01',
      }],
      acceptedLevel: 3,
      revision: 1,
    });

    const removed = await service.deleteTheme(f.actor, {
      subject: String(f.subject._id),
      themeKey: theme.key,
    });
    assert.deepEqual(removed, { archived: true, retainedAssessments: 1 });
    assert.equal((await Outcome.findById(outcome.id).lean()).status, 'ARCHIVED');
    assert.equal(
      (await Subject.findById(f.subject._id).lean()).themes.find((item) => item.key === theme.key).status,
      'ARCHIVED',
    );
  });

  it('makes exam assignment the only assessment gate and keeps scored rows in their theme', async () => {
    const f = await fixture();
    const subject = String(f.subject._id);
    const sheets = await import('../lib/casSheetService.js');
    const exam = await Exam.create({ school: f.actor.school, academicYear: f.academicYear._id, name: 'First Terminal Examination' });
    const assessable = async () => (await sheets.loadThemes(f.actor, {
      grade: 'Grade 3', subject, exam: String(exam._id), academicYear: String(f.academicYear._id),
    })).themes;

    const theme = await service.createTheme(f.actor, {
      subject,
      titleEn: 'Me and My Family',
      titleNe: '',
      workingHours: 15,
    });
    const outcome = await service.createOutcome(f.actor, {
      subject,
      themeKey: theme.key,
      titleEn: 'Recognise and produce rhyming words',
      titleNe: '',
      assessmentAspect: 'Listening',
      assessmentTool: 'Observation',
    });
    assert.equal(outcome.assessmentAspect, 'Listening');
    assert.equal(outcome.assessmentTool, 'Observation');
    assert.deepEqual(await assessable(), [], 'an unassigned theme is not assessable');
    await ThemeExam.create({
      school: f.actor.school, academicYear: f.academicYear._id, grade: 'Grade 3',
      subject: f.subject._id, themeKey: theme.key, exam: exam._id,
    });
    const [assigned] = await assessable();
    assert.equal(assigned.key, theme.key, 'exam assignment makes a complete theme assessable');
    const legacyPublishedAt = new Date('2025-05-01T00:00:00.000Z');
    await Subject.updateOne(
      { _id: f.subject._id },
      { $set: {
        'themes.$[theme].assessmentStatus': 'PUBLISHED',
        'themes.$[theme].publishedAt': legacyPublishedAt,
      } },
      { arrayFilters: [{ 'theme.key': theme.key }] },
    );
    await service.updateTheme(f.actor, { subject, themeKey: theme.key, titleEn: 'Me and My Home' });
    const [live] = await assessable();
    assert.equal(live.key, theme.key);
    assert.equal(live.titleEn, 'Me and My Home', 'renaming keeps the exam assignment');
    const storedLegacy = (await Subject.findById(f.subject._id).lean()).themes.find((row) => row.key === theme.key);
    assert.equal(storedLegacy.assessmentStatus, 'PUBLISHED', 'obsolete metadata is preserved but not used');
    assert.equal(storedLegacy.publishedAt.toISOString(), legacyPublishedAt.toISOString());

    await Assessment.create({
      school: f.actor.school,
      academicYear: f.academicYear._id,
      grade: 'Grade 3',
      student: id(),
      studentName: 'Synthetic student',
      subject: f.subject._id,
      subjectCode: 'ENG',
      outcome: outcome.id,
      outcomeCode: outcome.code,
      attempts: [{ attemptType: 'INITIAL', attemptNumber: 1, level: 4, assessmentDate: '2026-05-01' }],
      acceptedLevel: 4,
      revision: 1,
    });
    const reworded = await service.updateOutcome(f.actor, {
      outcome: outcome.id,
      titleEn: 'Recognise, identify and produce rhyming words',
    });
    assert.equal(reworded.titleEn, 'Recognise, identify and produce rhyming words');
    const other = await service.createTheme(f.actor, { subject, titleEn: 'My Daily Life', titleNe: '', workingHours: null });
    await assert.rejects(
      service.updateOutcome(f.actor, { outcome: outcome.id, themeKey: other.key }),
      /cannot move to another theme/,
    );

    await ThemeExam.deleteMany({ exam: exam._id, themeKey: theme.key });
    assert.deepEqual(await assessable(), [], 'removing the exam assignment removes the theme from assessment');
  });

  it('saves a whole edited theme in one transaction', async () => {
    const f = await fixture();
    const subject = String(f.subject._id);
    const theme = await service.createTheme(f.actor, { subject, titleEn: 'Draft name', titleNe: '', workingHours: null });
    const book = (rows, extra = {}) => ({
      subject, themeKey: theme.key, titleEn: 'Me and My Family', titleNe: 'म र मेरो परिवार', workingHours: 15, rows, ...extra,
    });
    const activeRows = async () => (await service.loadCurriculum(f.actor, { grade: 'Grade 3' }))[0].outcomes;

    await service.saveThemeBook(f.actor, book([
      { titleEn: 'Row one', assessmentAspect: 'Listening', assessmentTool: 'Observation' },
      { titleEn: 'Row two' },
      { titleEn: 'Row three' },
    ]));
    let rows = await activeRows();
    assert.deepEqual(rows.map((row) => row.titleEn), ['Row one', 'Row two', 'Row three']);
    assert.equal(rows[0].assessmentAspect, 'Listening');
    assert.equal(rows[0].themeEn, 'Me and My Family');
    const [one, , three] = rows;

    await service.saveThemeBook(f.actor, book([
      { id: one.id, titleEn: 'Row one, reworded', assessmentAspect: 'Listening' },
      { id: three.id, titleEn: 'Row three' },
      { titleEn: 'Row four' },
    ]));
    rows = await activeRows();
    assert.deepEqual(rows.map((row) => row.titleEn), ['Row one, reworded', 'Row three', 'Row four']);

    await Assessment.create({
      school: f.actor.school, academicYear: id(), grade: 'Grade 3', student: id(),
      studentName: 'Synthetic student', subject: f.subject._id, subjectCode: 'ENG',
      outcome: one.id, outcomeCode: one.code,
      attempts: [{ attemptType: 'INITIAL', attemptNumber: 1, level: 2, assessmentDate: '2026-05-01' }],
      acceptedLevel: 2, revision: 1,
    });
    const current = await activeRows();
    assert.equal(current[0].scored, true);
    await service.saveThemeBook(f.actor, book(
      current.map((row, index) => ({ id: row.id, titleEn: index === 0 ? 'Scored row reworded' : row.titleEn })),
    ));
    assert.equal((await activeRows())[0].titleEn, 'Scored row reworded', 'a scored row can be reworded');
    assert.equal(await Assessment.countDocuments({ outcome: one.id }), 1, 'its recorded score is kept');

    await assert.rejects(
      service.saveThemeBook(f.actor, book([
        { id: one.id, titleEn: 'Should not be saved' },
        { id: String(id()), titleEn: 'A row from somewhere else' },
        { titleEn: 'Must not be created' },
      ])),
      /changed while you were editing/,
    );
    assert.deepEqual(
      (await activeRows()).map((row) => row.titleEn),
      ['Scored row reworded', 'Row three', 'Row four'],
      'a refused save writes nothing',
    );

    const saved = await service.saveThemeBook(f.actor, book([]));
    assert.deepEqual([saved.archived, saved.deleted], [1, 2]);
    assert.equal(saved.theme.assessmentStatus, undefined, 'themes no longer have a competing assessment status');
    assert.equal((await Outcome.findById(one.id).lean()).status, 'ARCHIVED');
  });
});
