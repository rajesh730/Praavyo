// Read-only inspection: counts and structural metadata, never identities or
// credentials. Run with `npm run db:inspect` from the monorepo root.
require('dotenv').config({ path: '.env.local', quiet: true });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;

  const users = await db
    .collection('users')
    .find({ role: 'SCHOOL_ADMIN' }, { projection: { schoolName: 1, status: 1 } })
    .toArray();

  for (const school of users) {
    const scope = { school: school._id };
    const [students, teachers, grades, years, subjects, outcomes, assessments, reports] =
      await Promise.all([
        db.collection('students').countDocuments({ ...scope, isDeleted: { $ne: true } }),
        db.collection('teachers').countDocuments(scope),
        db.collection('students').distinct('grade', { ...scope, isDeleted: { $ne: true } }),
        db.collection('academicyears').find(scope, { projection: { year: 1, status: 1 } }).toArray(),
        db.collection('cassubjects').countDocuments(scope),
        db.collection('caslearningoutcomes').countDocuments(scope),
        db.collection('casassessments').countDocuments(scope),
        db.collection('casreports').countDocuments(scope),
      ]);

    console.log(`\nSCHOOL  ${school.schoolName}  (${school._id})`);
    console.log(`  pravyo    students=${students} teachers=${teachers}`);
    console.log(`  grades    ${grades.sort().join(', ') || '(none)'}`);
    console.log(`  years     ${years.map((y) => `${y.year}:${y.status}`).join(', ') || '(none)'}`);
    console.log(`  cas       subjects=${subjects} outcomes=${outcomes} assessments=${assessments} reports=${reports}`);
  }
})()
  .catch((error) => {
    console.error('Read-only inspection failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
