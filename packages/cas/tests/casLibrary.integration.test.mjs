import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { register } from 'node:module';
import mongoose from 'mongoose';
import { startLocalMongo } from './helpers/localMongo.mjs';

describe('default theme library on an isolated MongoDB replica set', {
  skip: process.env.CAS_TEST_MONGOD ? false : 'Set CAS_TEST_MONGOD to run database integration tests',
}, () => {
  let mongo;
  let library;
  let Subject, Outcome, Assessment;
  let LIBRARY_SCHOOL_ID;
  const originalUri = process.env.MONGODB_URI;
  const id = () => new mongoose.Types.ObjectId();

  before(async () => {
    mongo = await startLocalMongo(process.env.CAS_TEST_MONGOD);
    process.env.MONGODB_URI = mongo.uri;
    register('./helpers/service-loader.mjs', import.meta.url);
    library = await import('../lib/casLibraryService.js');
    ({ LIBRARY_SCHOOL_ID } = await import('@pravyo/core/themeLibrary'));
    [Subject, Outcome, Assessment] = await Promise.all([
      import('@pravyo/db/models/cas/CasSubject'),
      import('@pravyo/db/models/cas/CasLearningOutcome'),
      import('@pravyo/db/models/cas/CasAssessment'),
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

  const outcome = (school, subject, code, themeKey, titleEn, sequence) => ({
    school, grade: 'Grade 3', subject, subjectCode: 'ENG', code, themeKey,
    themeEn: 'Theme One', titleEn, sequence, status: 'ACTIVE',
  });

  async function fixture() {
    const school = id();
    const actor = { id: String(id()), role: 'SCHOOL_ADMIN', school: String(school) };
    const lib = await Subject.create({
      school: LIBRARY_SCHOOL_ID, grade: 'Grade 3', code: `ENG${Math.random().toString(36).slice(2, 6).toUpperCase()}`, titleEn: 'English',
      themes: [
        { key: 'lib-t1', titleEn: 'Theme One', sequence: 1 },
        { key: 'lib-t2', titleEn: 'Theme Two', sequence: 2 },
      ],
    });
    await Outcome.insertMany([
      outcome(LIBRARY_SCHOOL_ID, lib._id, 'ENG-1', 'lib-t1', 'Reads words', 1),
      outcome(LIBRARY_SCHOOL_ID, lib._id, 'ENG-2', 'lib-t1', 'Writes letters', 2),
      { ...outcome(LIBRARY_SCHOOL_ID, lib._id, 'ENG-3', 'lib-t2', 'Speaks', 1), themeEn: 'Theme Two' },
    ]);
    const own = await Subject.create({ school, grade: 'Grade 3', code: 'ENGLISH', titleEn: 'English' });
    return { school, actor, lib, own };
  }

  it('links a school subject and copies only the ticked default themes', async () => {
    const { actor, lib, own } = await fixture();
    await library.linkLibrarySubject(actor, { subject: String(own._id), librarySubject: String(lib._id) });
    const { added } = await library.addLibraryThemes(actor, { subject: String(own._id), themeKeys: ['lib-t1'] });
    assert.equal(added, 1);

    const overview = await library.libraryOverview(actor, { subject: String(own._id) });
    assert.deepEqual(overview.themes.map((theme) => theme.status), ['UP_TO_DATE', 'NOT_ADDED']);
    const copied = await Outcome.find({ school: actor.school, subject: own._id }).lean();
    assert.equal(copied.length, 2);
  });

  it('shows an update when the library changes, and the school decides', async () => {
    const { actor, lib, own } = await fixture();
    await library.linkLibrarySubject(actor, { subject: String(own._id), librarySubject: String(lib._id) });
    await library.addLibraryThemes(actor, { subject: String(own._id), themeKeys: ['lib-t1'] });

    // The super admin edits the default: rewords ENG-1, drops ENG-2, adds ENG-4.
    await Outcome.updateOne({ school: LIBRARY_SCHOOL_ID, subject: lib._id, code: 'ENG-1' }, { $set: { titleEn: 'Reads simple words' } });
    await Outcome.deleteOne({ school: LIBRARY_SCHOOL_ID, subject: lib._id, code: 'ENG-2' });
    await Outcome.create(outcome(LIBRARY_SCHOOL_ID, lib._id, 'ENG-4', 'lib-t1', 'Spells names', 3));

    let overview = await library.libraryOverview(actor, { subject: String(own._id) });
    assert.equal(overview.themes[0].status, 'UPDATE_AVAILABLE');

    // A teacher already scored ENG-2 in this school.
    const scored = await Outcome.findOne({ school: actor.school, subject: own._id, code: 'ENG-2' }).lean();
    const markedOutcome = await Outcome.findOne({ school: actor.school, subject: own._id, code: 'ENG-1' }).lean();
    await Assessment.collection.insertMany([
      { school: new mongoose.Types.ObjectId(actor.school), outcome: scored._id, attempts: [] },
      { school: new mongoose.Types.ObjectId(actor.school), outcome: markedOutcome._id, attempts: [] },
    ]);

    const preview = await library.previewThemeUpdate(actor, { subject: String(own._id), themeKey: 'lib-t1' });
    assert.deepEqual(preview.added.map((row) => row.code), ['ENG-4']);
    assert.deepEqual(preview.changed.map((row) => row.code), ['ENG-1']);
    assert.deepEqual(preview.removed.map((row) => [row.code, row.hasMarks]), [['ENG-2', true]]);
    assert.equal(preview.edited, false);

    await library.applyThemeUpdate(actor, { subject: String(own._id), themeKey: 'lib-t1' });
    const rows = await Outcome.find({ school: actor.school, subject: own._id }).lean();
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
    // Same code updated in place: the outcome with marks keeps its id.
    assert.equal(String(byCode['ENG-1']._id), String(markedOutcome._id));
    assert.equal(byCode['ENG-1'].titleEn, 'Reads simple words');
    // Dropped but marked → archived, not deleted.
    assert.equal(byCode['ENG-2'].status, 'ARCHIVED');
    assert.equal(byCode['ENG-4'].status, 'ACTIVE');

    overview = await library.libraryOverview(actor, { subject: String(own._id) });
    assert.equal(overview.themes[0].status, 'UP_TO_DATE');
  });

  it('offers a theme the super admin adds later, and keeps a copy whose library theme was deleted', async () => {
    const { actor, lib, own } = await fixture();
    await library.linkLibrarySubject(actor, { subject: String(own._id), librarySubject: String(lib._id) });
    await library.addLibraryThemes(actor, { subject: String(own._id), themeKeys: ['lib-t1', 'lib-t2'] });

    // The super admin creates Theme Three and deletes Theme Two.
    await Subject.updateOne({ _id: lib._id }, { $pull: { themes: { key: 'lib-t2' } } });
    await Subject.updateOne({ _id: lib._id }, { $push: { themes: { key: 'lib-t3', titleEn: 'Theme Three', sequence: 3 } } });
    await Outcome.deleteMany({ school: LIBRARY_SCHOOL_ID, subject: lib._id, themeKey: 'lib-t2' });
    await Outcome.create({ ...outcome(LIBRARY_SCHOOL_ID, lib._id, 'ENG-5', 'lib-t3', 'Sings', 1), themeEn: 'Theme Three' });

    const overview = await library.libraryOverview(actor, { subject: String(own._id) });
    assert.deepEqual(overview.themes.map((theme) => [theme.key, theme.status]), [['lib-t1', 'UP_TO_DATE'], ['lib-t3', 'NOT_ADDED']]);
    assert.deepEqual(overview.removedFromLibrary.map((theme) => theme.titleEn), ['Theme Two']);
    // The school's copy of the deleted theme is untouched.
    assert.equal(await Outcome.countDocuments({ school: actor.school, subject: own._id, code: 'ENG-3', status: 'ACTIVE' }), 1);

    const { added } = await library.addLibraryThemes(actor, { subject: String(own._id), themeKeys: ['lib-t3'] });
    assert.equal(added, 1);
  });

  it('flags a school edit and never touches the school’s own themes', async () => {
    const { actor, lib, own } = await fixture();
    await library.linkLibrarySubject(actor, { subject: String(own._id), librarySubject: String(lib._id) });
    await library.addLibraryThemes(actor, { subject: String(own._id), themeKeys: ['lib-t1'] });

    // The school edits its copy and creates a theme of its own.
    await Outcome.updateOne({ school: actor.school, subject: own._id, code: 'ENG-1' }, { $set: { titleEn: 'Our school wording' } });
    await Subject.updateOne({ _id: own._id }, { $push: { themes: { key: 'own-1', titleEn: 'Local stories', sequence: 9 } } });
    await Outcome.create({ ...outcome(actor.school, own._id, 'LOC-1', 'own-1', 'Tells a local story', 1), themeEn: 'Local stories' });
    await Outcome.updateOne({ school: LIBRARY_SCHOOL_ID, subject: lib._id, code: 'ENG-2' }, { $set: { titleEn: 'Writes all letters' } });

    const preview = await library.previewThemeUpdate(actor, { subject: String(own._id), themeKey: 'lib-t1' });
    assert.equal(preview.edited, true);
    await library.applyThemeUpdate(actor, { subject: String(own._id), themeKey: 'lib-t1' });

    const rows = await Outcome.find({ school: actor.school, subject: own._id, status: 'ACTIVE' }).lean();
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));
    assert.equal(byCode['ENG-1'].titleEn, 'Reads words');
    assert.equal(byCode['LOC-1'].titleEn, 'Tells a local story');
    const saved = await Subject.findById(own._id).lean();
    assert.ok(saved.themes.some((theme) => theme.key === 'own-1' && !theme.sourceThemeKey));
  });

  it('gives a new school its own linked copy of every default subject, once', async () => {
    const { lib } = await fixture();
    const school = id();
    const actor = { id: String(id()), role: 'SCHOOL_ADMIN', school: String(school) };
    const librarySubjects = await Subject.countDocuments({ school: LIBRARY_SCHOOL_ID, status: 'ACTIVE' });

    const result = await library.provisionDefaultCurriculum(school);
    assert.equal(result.subjects, librarySubjects);
    assert.equal(result.copied.length, librarySubjects);
    const copy = await Subject.findOne({ school, librarySubject: lib._id }).lean();
    assert.equal(copy.code, lib.code);
    assert.deepEqual(copy.themes.map((theme) => theme.sourceThemeKey), ['lib-t1', 'lib-t2']);
    assert.equal(await Outcome.countDocuments({ school, subject: copy._id }), 3);

    const overview = await library.libraryOverview(actor, { subject: String(copy._id) });
    assert.deepEqual(overview.themes.map((theme) => theme.status), ['UP_TO_DATE', 'UP_TO_DATE']);

    // The school's edit stays local; the library is untouched.
    await Outcome.updateOne({ school, subject: copy._id, code: 'ENG-1' }, { $set: { titleEn: 'Our wording' } });
    const source = await Outcome.findOne({ school: LIBRARY_SCHOOL_ID, subject: lib._id, code: 'ENG-1' }).lean();
    assert.equal(source.titleEn, 'Reads words');

    // The school deletes a copied subject: a later run never brings it back.
    await Outcome.deleteMany({ school, subject: copy._id });
    await Subject.deleteOne({ _id: copy._id });
    const again = await library.provisionDefaultCurriculum(school, { received: result.copied });
    assert.equal(again.subjects, 0);
    assert.equal(await Subject.countDocuments({ school }), librarySubjects - 1);
  });

  it('delivers a grade added to the library later, but never Grades 6–10', async () => {
    await fixture();
    const school = id();
    const first = await library.provisionDefaultCurriculum(school);

    const grade4 = await Subject.create({
      school: LIBRARY_SCHOOL_ID, grade: 'Grade 4', code: `MATH${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      titleEn: 'Mathematics', themes: [{ key: 'g4-t1', titleEn: 'Numbers', sequence: 1 }],
    });
    await Outcome.create({ ...outcome(LIBRARY_SCHOOL_ID, grade4._id, 'M4-1', 'g4-t1', 'Counts to 1000', 1), grade: 'Grade 4' });
    await Subject.create({ school: LIBRARY_SCHOOL_ID, grade: 'Grade 6', code: 'PHASE2', titleEn: 'Not in phase 1' });

    const later = await library.provisionDefaultCurriculum(school, { received: first.copied });
    assert.deepEqual(later.copied.map(String), [String(grade4._id)]);
    assert.equal(await Subject.countDocuments({ school, grade: 'Grade 6' }), 0);
    await Subject.deleteMany({ school: LIBRARY_SCHOOL_ID, grade: { $in: ['Grade 4', 'Grade 6'] } });
  });

  it('syncs an approved school automatically when a grade is added to the library', async () => {
    const { default: User } = await import('@pravyo/db/models/User');
    await fixture();
    const school = id();
    await User.collection.insertOne({ _id: school, role: 'SCHOOL_ADMIN', status: 'APPROVED', email: `s${school}@test.local` });
    const pending = id();
    await User.collection.insertOne({ _id: pending, role: 'SCHOOL_ADMIN', status: 'PENDING', email: `p${pending}@test.local` });

    const first = await library.syncDefaultCurriculum(school);
    assert.ok(first.subjects > 0);
    const received = (await User.findById(school).lean()).casDefaultSubjects.map(String);
    assert.deepEqual(received.sort(), first.copied.map(String).sort());
    assert.equal(await library.syncDefaultCurriculum(pending), null);
    assert.equal(await Subject.countDocuments({ school: pending }), 0);

    // The library gains Grade 4; the next visit (after the throttle) delivers it.
    const grade4 = await Subject.create({
      school: LIBRARY_SCHOOL_ID, grade: 'Grade 4', code: 'SYNC4', titleEn: 'Science',
      themes: [{ key: 's4-t1', titleEn: 'Matter', sequence: 1 }],
    });
    assert.equal(await library.syncDefaultCurriculum(school), null, 'throttled within a minute');
    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 60 * 1000;
    try {
      const later = await library.syncDefaultCurriculum(school);
      assert.deepEqual(later.copied.map(String), [String(grade4._id)]);
      assert.equal(await Subject.countDocuments({ school, grade: 'Grade 4' }), 1);
    } finally {
      Date.now = realNow;
    }
    await Subject.deleteOne({ _id: grade4._id });
  });

  it('leaves a grade the school set up itself alone and still fills the others', async () => {
    const { school, own } = await fixture();
    const grade1 = await Subject.create({ school: LIBRARY_SCHOOL_ID, grade: 'Grade 1', code: 'G1ENG', titleEn: 'English' });

    const result = await library.provisionDefaultCurriculum(school);
    assert.deepEqual(result.skippedGrades, ['Grade 3']);
    assert.deepEqual(result.copied.map(String), [String(grade1._id)]);
    const grade3 = await Subject.find({ school, grade: 'Grade 3' }).lean();
    assert.deepEqual(grade3.map((row) => String(row._id)), [String(own._id)]);
    await Subject.deleteOne({ _id: grade1._id });
  });
});
