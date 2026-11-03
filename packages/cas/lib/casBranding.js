import SchoolConfig from '@pravyo/db/models/SchoolConfig';
import User from '@pravyo/db/models/User';
import Teacher from '@pravyo/db/models/Teacher';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { teacherIdsAtSchool } from '@pravyo/db/teacherMemberships';

/**
 * Everything on a report card that describes the SCHOOL rather than the
 * result: the logo (Public Profile), the optional right-hand image (Settings),
 * the principal's name (school profile) and each grade's class teacher
 * (Teachers page, CLASS_TEACHER assignments).
 *
 * Attached when a card is read rather than frozen into the snapshot, so a
 * school that adds its logo, changes principal or reassigns a class teacher
 * sees it on every card, published or not. None of it changes the result.
 */
export async function loadReportBranding(schoolIds) {
  const ids = [...new Set([].concat(schoolIds).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const objectIds = ids.map((id) => new SchoolConfig.base.Types.ObjectId(id));

  const [configs, profiles, schools, classTeachers] = await Promise.all([
    SchoolConfig.find({ school: { $in: ids } }).select('school reportCardImageUrl').lean(),
    // The profile model belongs to the Pravyo app; read its collection directly.
    SchoolConfig.db.collection('schoolshowcaseprofiles')
      .find({ school: { $in: objectIds } }, { projection: { school: 1, coverImageUrl: 1 } })
      .toArray(),
    User.find({ _id: { $in: ids } }).select('principalName').lean(),
    loadClassTeachers(ids),
  ]);
  const imageBySchool = new Map(configs.map((row) => [String(row.school), row.reportCardImageUrl || '']));
  const logoBySchool = new Map(profiles.map((row) => [String(row.school), row.coverImageUrl || '']));
  const principalBySchool = new Map(schools.map((row) => [String(row._id), row.principalName || '']));
  return new Map(ids.map((id) => [id, {
    logoUrl: logoBySchool.get(id) || '',
    reportImageUrl: imageBySchool.get(id) || '',
    principalName: principalBySchool.get(id) || '',
    // { "Grade 1": "Sita Sharma", ... } — names joined when a grade has several.
    classTeachers: classTeachers.get(id) || {},
  }]));
}

/** Class teacher names per grade, for teachers still active at each school. */
async function loadClassTeachers(schoolIds) {
  const rows = await TeacherTeachingAssignment.find({ school: { $in: schoolIds }, assignmentType: 'CLASS_TEACHER' })
    .select('school teacher grade').lean();
  const bySchool = new Map();
  if (!rows.length) return bySchool;

  const [teachers, activeBySchool] = await Promise.all([
    Teacher.find({ _id: { $in: [...new Set(rows.map((row) => String(row.teacher)))] } }).select('name').lean(),
    Promise.all(schoolIds.map(async (school) => [school, new Set((await teacherIdsAtSchool(school)).map(String))])),
  ]);
  const nameById = new Map(teachers.map((row) => [String(row._id), row.name]));
  const active = new Map(activeBySchool);

  for (const row of rows) {
    const school = String(row.school);
    const teacher = String(row.teacher);
    const name = nameById.get(teacher);
    if (!name || !active.get(school)?.has(teacher)) continue;
    const grades = bySchool.get(school) || {};
    grades[row.grade] = grades[row.grade] ? `${grades[row.grade]}, ${name}` : name;
    bySchool.set(school, grades);
  }
  return bySchool;
}

/** Attach one school's report-card identity to each report. */
export async function withBranding(schoolId, reports) {
  const branding = (await loadReportBranding(schoolId)).get(String(schoolId))
    || { logoUrl: '', reportImageUrl: '', principalName: '', classTeachers: {} };
  return reports.map((report) => (report ? { ...report, branding } : report));
}
