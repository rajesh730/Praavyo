import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasStudentRecord from '@pravyo/db/models/cas/CasStudentRecord';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';

/**
 * Build indexes for the CAS collections only.
 *
 * CAS shares a database with Pravyo, so `autoIndex` is off globally — letting
 * Mongoose index on connect would have this app create indexes on collections
 * it does not own. Runs once per process.
 */
const CAS_MODELS = [
  CasSubject,
  CasLearningOutcome,
  CasAssessment,
  CasReport,
  CasStudentRecord,
  CasExam,
  CasThemeExam,
  CasExamTeacherAssignment,
];

export default async function ensureCasIndexes() {
  if (!globalThis.__casIndexes) {
    globalThis.__casIndexes = (async () => {
      await dropLegacyReportUniqueIndex();
      await dropTermReportUniqueIndex();
      await dropLegacyAssessmentUniqueIndex();
      await dropYearlyStudentRecordUniqueIndex();
      return Promise.all(CAS_MODELS.map((model) => model.createIndexes()));
    })().catch((error) => {
      // Let the next request retry rather than caching a failure forever.
      globalThis.__casIndexes = null;
      throw error;
    });
  }
  return globalThis.__casIndexes;
}

async function dropLegacyReportUniqueIndex() {
  const collection = CasReport.collection;
  const indexes = await collection.indexes();
  // Earlier pilots used both `academicYear` and the now-removed `plan/period`
  // fields. A result belongs to a student's explicit result key now, so any
  // unique per-student report index without that key would reject a legitimate
  // second terminal result. CasReport is CAS-owned, making this migration
  // intentionally narrow but safe.
  const legacy = indexes.find((index) =>
    index.unique && index.key.student === 1 && !index.key.resultKey);

  if (legacy) {
    await collection.dropIndex(legacy.name);
  }
}

async function dropTermReportUniqueIndex() {
  const collection = CasReport.collection;
  const indexes = await collection.indexes();
  const old = indexes.find((index) => index.unique &&
    index.key.school === 1 && index.key.academicYear === 1 &&
    index.key.student === 1 && index.key.examTerm === 1);
  if (old) await collection.dropIndex(old.name);
}

async function dropYearlyStudentRecordUniqueIndex() {
  const collection = CasStudentRecord.collection;
  const indexes = await collection.indexes().catch(() => []);
  // Attendance was once one record per student per year. It is per exam now,
  // so a unique student key without `exam` would reject a second exam.
  const old = indexes.find((index) => index.unique &&
    index.key.student === 1 && index.key.academicYear === 1 && !index.key.exam);
  if (old) await collection.dropIndex(old.name);
}

async function dropLegacyAssessmentUniqueIndex() {
  const collection = CasAssessment.collection;
  const indexes = await collection.indexes();
  // The first CAS pilot used `plan` and `period` before the academic-year
  // model was introduced. Both versions prevent a second exam from recording
  // the same outcome because neither key contains `exam`. This collection is
  // CAS-owned, so any unique student/outcome key without the exam dimension is
  // obsolete and can be replaced by the current partial exam-aware index.
  const old = indexes.find((index) => index.unique &&
    index.key.student === 1 && index.key.outcome === 1 && !index.key.exam);
  if (old) await collection.dropIndex(old.name);
}
