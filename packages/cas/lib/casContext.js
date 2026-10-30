import connectDB from '@pravyo/db';
import { bsAcademicYearLabel } from '@pravyo/core/nepaliDate';
import User from '@pravyo/db/models/User';
import Student from '@pravyo/db/models/Student';
import AcademicYear from '@pravyo/db/models/AcademicYear';
import SchoolConfig from '@pravyo/db/models/SchoolConfig';
import { assert, sameId } from './casAccess.js';
import { sectionsForGrade } from './casSections.js';
import { LIBRARY_GRADES } from '@pravyo/core/themeLibrary';

/**
 * Everything CAS reads out of Pravyo.
 *
 * CAS owns no school, student or academic-year record. This is the only module
 * that reads them, so the boundary stays visible: if a field is not fetched
 * here, no CAS screen can invent it.
 */

// Every field below exists on the Pravyo school account. CAS never asks a
// school to retype any of it and never stores its own copy.
const SCHOOL_FIELDS =
  'schoolName name email principalName principalPhone schoolLocation ' +
  'streetAddress province district municipality ward tole postalCode ' +
  'schoolPhone website establishedYear calendarPreference';

export async function loadSchool(actor) {
  await connectDB();
  if (actor.library) {
    return {
      id: actor.school, name: 'Default theme library', email: '', address: '', principalName: '',
      principalPhone: '', schoolCode: '', iemisNumber: '', phone: '', website: '', establishedYear: '',
      calendar: actor.calendar || 'BS', grades: LIBRARY_GRADES, gradeSections: [], library: true,
    };
  }
  const school = await User.findById(actor.school).select(SCHOOL_FIELDS).lean();
  assert(school, 'School record unavailable', 404);

  const config = await SchoolConfig.findOne({ school: actor.school })
    .select('grades gradeSections academicCalendar schoolCode iemisNumber city state')
    .lean();

  return {
    id: String(school._id),
    name: school.schoolName || school.name || 'School',
    email: school.email || '',
    address: formatAddress(school, config),
    principalName: school.principalName || '',
    principalPhone: school.principalPhone || '',
    schoolCode: config?.schoolCode || '',
    iemisNumber: config?.iemisNumber || '',
    phone: school.schoolPhone || '',
    website: school.website || '',
    establishedYear: school.establishedYear || '',
    calendar: school.calendarPreference || config?.academicCalendar || 'BS',
    // Grades come from the school's own Pravyo configuration, so the Grade
    // dropdown is never a hard-coded list.
    grades: config?.grades || [],
    gradeSections: config?.gradeSections || [],
  };
}

export async function loadGradeSections(actor, grade) {
  await connectDB();
  const config = await SchoolConfig.findOne({ school: actor.school })
    .select('gradeSections')
    .lean();
  return sectionsForGrade(config?.gradeSections || [], grade);
}

function formatAddress(school, config) {
  const parts = [
    school.tole,
    school.streetAddress,
    school.municipality
      ? `${school.municipality}${school.ward ? `-${school.ward}` : ''}`
      : '',
    school.district || config?.city,
    school.province || config?.state,
  ];
  const joined = parts.filter((p) => String(p || '').trim()).join(', ');
  return joined || school.schoolLocation || '';
}

export async function loadAcademicYears(actor) {
  await connectDB();
  const years = await AcademicYear.find({ school: actor.school })
    .sort({ yearStart: -1 })
    .lean();
  return years.map(normalizeYear);
}

export async function loadAcademicYear(actor, id) {
  await connectDB();
  const year = await AcademicYear.findOne({ _id: id, school: actor.school }).lean();
  assert(year, 'Academic year unavailable', 404);
  return normalizeYear(year);
}

/**
 * Pravyo's AcademicYear carries `yearStart` (a number) plus `startedAt`, which
 * is a lifecycle timestamp — when the record was opened, not when the school
 * year began. It is deliberately NOT used as a date boundary: a year created in
 * August would otherwise reject every assessment dated before it.
 */
function normalizeYear(year) {
  const start = Number(year.yearStart);
  return {
    id: String(year._id),
    // Shown as the running B.S. year ("2083"), as Nepali schools name a session.
    label: bsAcademicYearLabel(start) || year.year,
    labelAd: year.year,
    yearStart: start,
    calendar: year.calendar || 'AD',
    status: year.status,
    // A Nepali school year straddles two AD years.
    startDate: `${start}-01-01`,
    endDate: `${start + 1}-12-31`,
  };
}

/**
 * Students on the Pravyo roster for one grade and academic year.
 *
 * Reads enrolment history rather than the student's current grade, so a student
 * since promoted still appears for the year being assessed. CAS never creates a
 * Student — it only reads this list.
 */
export async function loadStudents(actor, { grade, yearStart, history = false }) {
  await connectDB();
  const students = await Student.find({
    // `history` reads who was enrolled that year, whatever they are now. A
    // result from an earlier year must still list a student who has since
    // graduated, left or transferred to another school.
    ...(history ? {} : { school: actor.school, status: 'ACTIVE' }),
    isDeleted: { $ne: true },
    enrollments: {
      $elemMatch: { school: actor.school, grade, academicYearStart: yearStart },
    },
  })
    .select('name grade rollNumber registrationNumber iemisNumber section enrollments subjectChoices')
    .lean();

  return students
    .map((s) => {
      const enrollment = (s.enrollments || []).find(
        (e) =>
          sameId(e.school, actor.school) &&
          e.grade === grade &&
          e.academicYearStart === yearStart,
      );
      return {
        id: String(s._id),
        name: s.name,
        grade,
        rollNumber: enrollment?.rollNumber || s.rollNumber || '',
        registrationNumber: s.registrationNumber || '',
        iemisNumber: s.iemisNumber || '',
        section: enrollment?.section || s.section || '',
        // Optional subjects the school assigned; see @pravyo/core/subjectScope.
        subjectChoices: (s.subjectChoices || []).map(String),
      };
    })
    // Roll numbers are strings in Pravyo, so "10" must not sort before "2".
    .sort(byRollThenName);
}

export function byRollThenName(a, b) {
  const ra = Number(a.rollNumber);
  const rb = Number(b.rollNumber);
  const aNum = Number.isFinite(ra);
  const bNum = Number.isFinite(rb);
  if (aNum && bNum && ra !== rb) return ra - rb;
  if (aNum !== bNum) return aNum ? -1 : 1;
  return String(a.name || '').localeCompare(String(b.name || ''));
}
