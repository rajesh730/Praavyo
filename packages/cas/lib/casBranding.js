import SchoolConfig from '@pravyo/db/models/SchoolConfig';
import User from '@pravyo/db/models/User';
import Student from '@pravyo/db/models/Student';
import Teacher from '@pravyo/db/models/Teacher';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { teacherIdsAtSchool } from '@pravyo/db/teacherMemberships';
import { SCHOOL_FIELDS, formatAddress } from './casContext.js';
import { sectionsForGrade } from './casSections.js';

const sameId = (left, right) => String(left || '') === String(right || '');

/**
 * Everything on a report card that describes the SCHOOL rather than the
 * result: the logo (Public Profile), the optional right-hand image (Settings),
 * the principal's name (school profile), each grade's class teacher
 * (Teachers page, CLASS_TEACHER assignments) and the school's IEMIS
 * registration number (Settings), and its current name and address (school
 * profile). `withBranding` adds each student's own
 * IEMIS number too, so both print on every card.
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
    SchoolConfig.find({ school: { $in: ids } }).select('school reportCardImageUrl iemisNumber city state').lean(),
    // The profile model belongs to the Pravyo app; read its collection directly.
    SchoolConfig.db.collection('schoolshowcaseprofiles')
      .find({ school: { $in: objectIds } }, { projection: { school: 1, logoUrl: 1, coverImageUrl: 1 } })
      .toArray(),
    User.find({ _id: { $in: ids } }).select(SCHOOL_FIELDS).lean(),
    loadClassTeachers(ids),
  ]);
  const imageBySchool = new Map(configs.map((row) => [String(row.school), row.reportCardImageUrl || '']));
  const iemisBySchool = new Map(configs.map((row) => [String(row.school), row.iemisNumber || '']));
  const logoBySchool = new Map(
    profiles.map((row) => [String(row.school), row.logoUrl || row.coverImageUrl || ''])
  );
  const principalBySchool = new Map(schools.map((row) => [String(row._id), row.principalName || '']));
  const configBySchool = new Map(configs.map((row) => [String(row.school), row]));
  const identityBySchool = new Map(schools.map((row) => [String(row._id), {
    schoolName: row.schoolName || row.name || '',
    schoolAddress: formatAddress(row, configBySchool.get(String(row._id))),
  }]));
  return new Map(ids.map((id) => [id, {
    logoUrl: logoBySchool.get(id) || '',
    reportImageUrl: imageBySchool.get(id) || '',
    principalName: principalBySchool.get(id) || '',
    schoolName: identityBySchool.get(id)?.schoolName || '',
    schoolAddress: identityBySchool.get(id)?.schoolAddress || '',
    schoolIemis: iemisBySchool.get(id) || '',
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

/**
 * Attach one school's report-card identity, and each student's live details,
 * to each report: IEMIS number, name, roll number and section.
 *
 * Roll number and section come from the student's enrollment in that grade
 * and year. A section prints only when the school has configured sections
 * for the grade and the student is in one of them; a stale section left on
 * an enrollment never shows.
 */
export async function withBranding(schoolId, reports) {
  const branding = (await loadReportBranding(schoolId)).get(String(schoolId))
    || { logoUrl: '', reportImageUrl: '', principalName: '', classTeachers: {}, schoolIemis: '' };
  const studentId = (report) => String(report?.student || report?.snapshot?.student?.id || '');
  const ids = [...new Set(reports.map(studentId).filter((id) => /^[a-f\d]{24}$/i.test(id)))];
  const [students, config] = await Promise.all([
    ids.length ? Student.find({ _id: { $in: ids } }).select('iemisNumber name rollNumber section enrollments').lean() : [],
    SchoolConfig.findOne({ school: schoolId }).select('gradeSections').lean(),
  ]);
  const byId = new Map(students.map((row) => [String(row._id), row]));

  function studentDetails(report) {
    const student = byId.get(studentId(report));
    if (!student) return {};
    const grade = report?.snapshot?.student?.grade || report?.grade || '';
    const yearStart = report?.snapshot?.academicYear?.yearStart;
    const enrollments = (student.enrollments || []).filter((row) => sameId(row.school, schoolId) && row.grade === grade);
    const enrollment = enrollments.find((row) => row.academicYearStart === yearStart)
      || enrollments.find((row) => row.status === 'CURRENT')
      || enrollments.at(-1);
    const section = String(enrollment?.section || student.section || '').trim();
    return {
      studentIemis: student.iemisNumber || '',
      studentName: student.name || '',
      studentRoll: String(enrollment?.rollNumber || student.rollNumber || ''),
      studentSection: section && sectionsForGrade(config?.gradeSections, grade).includes(section) ? section : '',
    };
  }

  return reports.map((report) => (report
    ? { ...report, branding: { ...branding, studentIemis: '', ...studentDetails(report) } }
    : report));
}
