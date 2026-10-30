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
import TeacherMembership from '@pravyo/db/models/TeacherMembership';
import TeacherTeachingAssignment from '@pravyo/db/models/TeacherTeachingAssignment';
import { activeSchoolsForTeacher, isActiveTeacherMember } from '@pravyo/db/teacherMemberships';

const subjectTitle = (subject) => subject.titleEn || subject.titleNe || subject.code;

/**
 * Everything a teacher sees on their dashboard, for the school chosen in their
 * session — and only what that school assigned to them. Results appear only
 * once the school has PUBLISHED them: a subject teacher sees their subject, a
 * class teacher sees the whole result for their grade.
 */
export const GET = defineRoute({ roles: ['TEACHER'] }, async ({ session }) => {
  const school = session.user.schoolId;
  if (!school) throw new APIError('Choose the school you are working in', 409, 'SCHOOL_REQUIRED');
  if (!await isActiveTeacherMember(session.user.id, school)) {
    throw new APIError('You no longer have access to this school', 403, 'FORBIDDEN');
  }

  const [teacher, membership, schools, assignments, year] = await Promise.all([
    Teacher.findById(session.user.id).select('name username email').lean(),
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
  const subjectIds = [...new Set([
    ...assignments.filter((row) => row.subject).map((row) => String(row.subject)),
    ...grants.map((row) => String(row.subject)),
  ])];

  const [subjects, students, reports, exams] = await Promise.all([
    subjectIds.length ? CasSubject.find({ _id: { $in: subjectIds }, school }).select('grade code titleEn titleNe').lean() : [],
    grades.length ? Student.find({
      school, status: 'ACTIVE', isDeleted: { $ne: true },
      grade: { $in: [...new Set(grades.flatMap((grade) => getEquivalentGradeValues(grade)))] },
    }).select('name grade section rollNumber').sort({ grade: 1, rollNumber: 1, name: 1 }).lean() : [],
    grades.length ? CasReport.find({ school, status: 'PUBLISHED', grade: { $in: grades } })
      .select('grade exam snapshot publishedAt').sort({ publishedAt: -1 }).limit(500).lean() : [],
    grants.length ? CasExam.find({ _id: { $in: [...new Set(grants.map((row) => String(row.exam)))] }, school }).select('name').lean() : [],
  ]);
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));
  const examById = new Map(exams.map((exam) => [String(exam._id), exam.name]));
  const subjectAssignments = assignments.filter((row) => row.assignmentType === 'SUBJECT_TEACHER' && subjectById.has(String(row.subject)));
  const classGrades = new Set(assignments.filter((row) => row.assignmentType === 'CLASS_TEACHER').map((row) => row.grade));

  const reportExamIds = [...new Set(reports.map((report) => report.exam && String(report.exam)).filter(Boolean))];
  const reportExams = reportExamIds.length ? await CasExam.find({ _id: { $in: reportExamIds }, school }).select('name').lean() : [];
  const reportExamName = new Map(reportExams.map((exam) => [String(exam._id), exam.name]));

  const publishedResults = reports.flatMap((report) => {
    const snapshot = report.snapshot || {};
    const student = snapshot.student || {};
    const base = {
      studentName: student.name || 'Student',
      rollNumber: student.rollNumber || '',
      grade: report.grade,
      exam: report.exam ? reportExamName.get(String(report.exam)) || '' : '',
      publishedAt: report.publishedAt,
    };
    const classSummary = classGrades.has(report.grade)
      ? [{ ...base, kind: 'CLASS_RESULT', overallGrade: snapshot.overallGrade || '', gpa: snapshot.gpa ?? null }]
      : [];
    const subjectSummaries = (snapshot.subjects || []).flatMap((result) => {
      const assignment = subjectAssignments.find((row) => row.grade === report.grade && subjectById.get(String(row.subject)).code === result.subjectCode);
      return assignment ? [{
        ...base, kind: 'SUBJECT_RESULT',
        subject: subjectTitle(subjectById.get(String(assignment.subject))),
        gradeResult: result.grade || '', obtained: result.obtained ?? null, fullMarks: result.fullMarks ?? null,
      }] : [];
    });
    return [...classSummary, ...subjectSummaries];
  });

  return successResponse(200, 'Teacher workspace loaded', {
    teacher: { name: teacher.name, username: teacher.username || '', email: teacher.email, designation: membership?.designation || '' },
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
        exam: examById.get(String(row.exam)) || 'Exam',
        grade: row.grade,
        subject: subjectTitle(subjectById.get(String(row.subject))),
      })),
    // `grade` is reported as the assigned grade label ("Grade 3"), whichever
    // equivalent spelling the student record uses ("3", "grade 3").
    students: students.map((student) => ({
      id: String(student._id), name: student.name,
      grade: grades.find((grade) => getEquivalentGradeValues(grade).includes(student.grade)) || student.grade,
      section: student.section || '', rollNumber: student.rollNumber || '',
    })),
    publishedResults,
  });
});
