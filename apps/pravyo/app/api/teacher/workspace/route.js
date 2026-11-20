import { defineRoute } from '@/lib/routeHandler';
import { successResponse, APIError } from '@/lib/apiResponse';
import Teacher from '@/models/Teacher';
import Student from '@/models/Student';
import { getEquivalentGradeValues } from '@/lib/schoolGrades';
import AcademicYear from '@pravyo/db/models/AcademicYear';
import CasExam from '@pravyo/db/models/cas/CasExam';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasExamTeacherAssignment from '@pravyo/db/models/cas/CasExamTeacherAssignment';
import InternalExam from '@pravyo/db/models/cas/InternalExam';
import TeacherMembership from '@pravyo/db/models/TeacherMembership';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { activeSchoolsForTeacher, isActiveTeacherMember } from '@pravyo/db/teacherMemberships';

const subjectTitle = (subject) => subject.titleEn || subject.titleNe || subject.code;

/**
 * Everything a teacher sees on their dashboard, for the school chosen in their
 * session — and only what that school assigned to them. Published results are
 * not part of the teacher dashboard (owner, 2026-11-20: the Results tab was
 * removed), so no report card is read here.
 */
export const GET = defineRoute({ roles: ['TEACHER'] }, async ({ session }) => {
  const school = session.user.schoolId;
  if (!school) throw new APIError('Choose the school you are working in', 409, 'SCHOOL_REQUIRED');
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError('You no longer have access to this school', 403, 'FORBIDDEN');
  }

  const [teacher, membership, schools, assignments, year] = await Promise.all([
    Teacher.findById(session.user.id).select('name username email phone').lean(),
    TeacherMembership.findOne({ teacher: session.user.id, school }).select('designation').lean(),
    activeSchoolsForTeacher(session.user.id),
    TeacherTeachingAssignment.find({ school, teacher: session.user.id }).lean(),
    AcademicYear.findOne({ school, status: 'ACTIVE' }).select('_id').lean(),
  ]);
  if (!teacher) throw new APIError('Teacher account is unavailable', 403, 'FORBIDDEN');

  const grades = [...new Set(assignments.map((row) => row.grade))];
  const grants = year
    ? await CasExamTeacherAssignment.find({ school, teacher: teacher._id, academicYear: year._id }).select('exam grade subject').lean()
    : [];
  // Internal exam marks waiting for this teacher: each subject they teach
  // (Teachers page) in each still-unpublished internal exam of that grade.
  const taughtSubjects = assignments.filter((row) => row.assignmentType === 'SUBJECT_TEACHER' && row.subject);
  const openInternalExams = year && taughtSubjects.length
    ? await InternalExam.find({ school, academicYear: year._id, grade: { $in: [...new Set(taughtSubjects.map((row) => row.grade))] }, publishedAt: null }).select('grade').lean()
    : [];
  const internalOpen = taughtSubjects.reduce((sum, row) => sum + openInternalExams.filter((exam) => exam.grade === row.grade).length, 0);
  const subjectIds = [...new Set([
    ...assignments.filter((row) => row.subject).map((row) => String(row.subject)),
    ...grants.map((row) => String(row.subject)),
  ])];

  const [subjects, students, exams] = await Promise.all([
    subjectIds.length ? CasSubject.find({ _id: { $in: subjectIds }, school }).select('grade code titleEn titleNe').lean() : [],
    grades.length ? Student.find({
      school, status: 'ACTIVE', isDeleted: { $ne: true },
      grade: { $in: [...new Set(grades.flatMap((grade) => getEquivalentGradeValues(grade)))] },
    }).select('name grade section rollNumber').sort({ grade: 1, rollNumber: 1, name: 1 }).lean() : [],
    grants.length ? CasExam.find({ _id: { $in: [...new Set(grants.map((row) => String(row.exam)))] }, school }).select('name isCurrent status').lean() : [],
  ]);
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));
  const examById = new Map(exams.map((exam) => [String(exam._id), exam.name]));
  // The exam the school marked as current (live or upcoming) in Manage Exams.
  const currentExamIds = new Set(exams.filter((exam) => exam.isCurrent && exam.status === 'ACTIVE').map((exam) => String(exam._id)));

  // Which (exam, grade) pairs the teacher holds are already published. A CAS
  // exam is published for the whole grade at once, so one published card means
  // the grade's result is out: its marks are locked until the school
  // unpublishes it in Manage Exams, and it no longer waits for mark entry.
  const grantGrades = [...new Set(grants.map((row) => row.grade))];
  // Report cards may spell a grade differently ("3", "Grade 3"); map each
  // spelling back to the grade label the teacher was assigned.
  const gradeLabel = new Map(grantGrades.flatMap((grade) => getEquivalentGradeValues(grade).map((value) => [value, grade])));
  const publishedRows = grants.length ? await CasReport.find({
    school, academicYear: year._id, status: 'PUBLISHED',
    exam: { $in: exams.map((exam) => exam._id) }, grade: { $in: [...gradeLabel.keys()] },
  }).select('exam grade').lean() : [];
  const publishedKeys = new Set(publishedRows.map((row) => `${row.exam}|${gradeLabel.get(row.grade) || row.grade}`));
  const publication = (row) => ({
    publishStatus: publishedKeys.has(`${row.exam}|${row.grade}`) ? 'PUBLISHED' : 'OPEN',
  });
  return successResponse(200, 'Teacher workspace loaded', {
    teacher: { name: teacher.name, username: teacher.username || '', email: teacher.email, phone: teacher.phone || '', designation: membership?.designation || '' },
    school: { id: String(school), name: session.user.schoolName || schools.find((row) => row.id === String(school))?.name || 'School' },
    canSwitchSchool: schools.length > 1,
    assignments: assignments.map((row) => {
      const subject = row.subject ? subjectById.get(String(row.subject)) : null;
      return {
        id: String(row._id), grade: row.grade, assignmentType: row.assignmentType,
        subject: subject ? { code: subject.code, title: subjectTitle(subject) } : null,
      };
    }),
    examAccess: grants
      .filter((row) => subjectById.has(String(row.subject)))
      .map((row) => ({
        // Ids let the dashboard open mark entry already filtered to this row.
        examId: String(row.exam),
        subjectId: String(row.subject),
        exam: examById.get(String(row.exam)) || 'Exam',
        currentExam: currentExamIds.has(String(row.exam)),
        grade: row.grade,
        subject: subjectTitle(subjectById.get(String(row.subject))),
        ...publication(row),
      })),
    // Subject × exam pairs open for internal marks (see above).
    internalOpen,
    // `grade` is reported as the assigned grade label ("Grade 3"), whichever
    // equivalent spelling the student record uses ("3", "grade 3").
    students: students.map((student) => ({
      id: String(student._id), name: student.name,
      grade: grades.find((grade) => getEquivalentGradeValues(grade).includes(student.grade)) || student.grade,
      section: student.section || '', rollNumber: student.rollNumber || '',
    })),
  });
});
