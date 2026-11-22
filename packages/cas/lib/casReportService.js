import connectDB from '@pravyo/db';
import { EXAMINED_FILTER, studentTakesSubject } from '@pravyo/core/subjectScope';
import Student from '@pravyo/db/models/Student';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasLearningOutcome from '@pravyo/db/models/cas/CasLearningOutcome';
import CasAssessment from '@pravyo/db/models/cas/CasAssessment';
import CasReport from '@pravyo/db/models/cas/CasReport';
import CasStudentRecord from '@pravyo/db/models/cas/CasStudentRecord';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import CasExam from '@pravyo/db/models/cas/CasExam';
import ParentStudentLink from '@pravyo/db/models/ParentStudentLink';
import UserNotification from '@pravyo/db/models/UserNotification';
import { notifyGuardians } from '@pravyo/core/parentNotifications';
import { sendAccountPush } from '@pravyo/core/webPush';
import ensureCasIndexes from './casIndexes.js';
import { assert, requireSchoolAdmin } from './casAccess.js';
import {
  reportInput, publishInput, gradePublishInput, gradeResultsQuery, reportCardsQuery,
  examUnpublishInput,
  examPublishingQuery,
  examPublishingAction,
  WHOLE_YEAR_EXAM,
} from './casValidation.js';
import { subjectResult, consolidate, getAcceptedLevel } from '@pravyo/core/casResults';
import {
  subjectResultSheet, finalResult, usesResultSheet, RESULT_SHEET_UNAVAILABLE,
} from './casResultSheet.js';
import { groupThemes, themeIdentity } from './casSheetService.js';
import {
  normalizeAttendance,
  normalizeExtraActivities,
} from '@pravyo/core/casSupplementary';
import { loadSchool, loadAcademicYear, loadStudents } from './casContext.js';
import { sectionsForGrade } from './casSections.js';
import { parseBsNumeric } from '@pravyo/core/nepaliDate';
import { DEFAULT_CAS_EXAM_TERM, normalizeExamTitle } from '@pravyo/core/casExamTerms';
import { assessmentExamFilter, examsThroughSelected, resultScopeKey } from './casExamScope.js';
import { loadReportBranding, withBranding } from './casBranding.js';
import { missingWorkOf } from './casExamService.js';

/** A BS issue date the school typed, checked to be a real calendar date. */
function checkedIssueDate(value) {
  if (!value) return null;
  const parsed = parseBsNumeric(value);
  assert(parsed, `${value} is not a valid B.S. date. Write it as YYYY/MM/DD, e.g. 2083/06/08.`, 400);
  return parsed.bs;
}

/**
 * Report-card wording is configured with its exam in Manage Exams, never per
 * publish run. The issue date is only ever the exam's own; the whole-year
 * result, which has no exam, takes the latest exam's.
 */
async function examReportPresentation(actor, year, exam, fallbackTitle) {
  if (exam) {
    return { examTitle: exam.reportTitle || exam.name, issueDate: checkedIssueDate(exam.issueDate) };
  }
  const latest = await CasExam.findOne({
    school: actor.school,
    academicYear: year.id,
    status: { $in: ['ACTIVE', 'ARCHIVED'] },
    mergedInto: { $exists: false },
    issueDate: { $nin: ['', null] },
  }).sort({ createdAt: -1, _id: -1 }).select('issueDate').lean();
  return { examTitle: fallbackTitle, issueDate: checkedIssueDate(latest?.issueDate) };
}

function resultKey(data) {
  return resultScopeKey(data) || DEFAULT_CAS_EXAM_TERM;
}

function withReportTerm(scope, term = DEFAULT_CAS_EXAM_TERM, examId, resultMode = 'EXAM', includePrevious = false, themeAssignmentIds) {
  if (resultMode === 'MERGED') return { ...scope, resultKey: 'MERGED' };
  if (themeAssignmentIds?.length && examId) {
    // A report generated before manual theme selection used the selected exam
    // (or its legacy cumulative key). Treat it as the same terminal result so
    // a new UI cannot duplicate an already published card.
    return {
      ...scope,
      $or: [
        { resultKey: `THEMES:${examId}` },
        { resultKey: String(examId) },
        { resultKey: `CUMULATIVE:${examId}` },
        { resultKey: { $exists: false }, exam: examId },
      ],
    };
  }
  if (includePrevious && examId) return { ...scope, resultKey: `CUMULATIVE:${examId}` };
  if (examId) return { ...scope, $or: [
    { resultKey: String(examId) },
    { resultKey: { $exists: false }, exam: examId },
  ] };
  return term === DEFAULT_CAS_EXAM_TERM
    ? { ...scope, $or: [{ examTerm: term }, { examTerm: { $exists: false } }] }
    : { ...scope, examTerm: term };
}

async function resolveExamIds(actor, { academicYear, examId, includePrevious = false, resultMode = 'EXAM' }) {
  if (resultMode === 'MERGED' || !examId) return [];
  if (!includePrevious) return [examId];
  const exams = await CasExam.find({
    school: actor.school,
    academicYear,
    mergedInto: { $exists: false },
  }).sort({ createdAt: 1, _id: 1 }).select('_id').lean();
  const ids = examsThroughSelected(exams, examId);
  assert(ids.length > 0, 'Exam unavailable for this grade and year', 404);
  return ids;
}

/**
 * A report may reuse marks from any explicitly chosen theme assignment. The
 * assignment, rather than an exam name or creation date, is the durable source
 * of truth for where that theme's marks came from.
 */
async function resolveThemeAssignments(actor, { academicYear, grade, themeAssignmentIds }) {
  if (!themeAssignmentIds?.length) return null;
  const ids = [...new Set(themeAssignmentIds.map(String))];
  assert(ids.length === themeAssignmentIds.length, 'A theme was selected more than once', 400);
  const rows = await CasThemeExam.find({
    _id: { $in: ids },
    school: actor.school,
    academicYear,
    grade,
  }).select('_id exam subject themeKey').lean();
  assert(rows.length === ids.length, 'One or more selected themes are unavailable for this grade and academic year', 404);
  return rows;
}

function selectedThemeAssessmentFilter(assignments, curriculum) {
  const outcomeIdsByExam = new Map();
  for (const assignment of assignments) {
    const subject = curriculum.find(({ subject: row }) => String(row._id) === String(assignment.subject));
    const theme = subject?.themes.find((row) => row.key === assignment.themeKey);
    if (!theme?.outcomes?.length) continue;
    const examId = String(assignment.exam);
    if (!outcomeIdsByExam.has(examId)) outcomeIdsByExam.set(examId, []);
    outcomeIdsByExam.get(examId).push(...theme.outcomes.map((outcome) => outcome._id));
  }
  return {
    $or: [...outcomeIdsByExam].map(([exam, outcome]) => ({ exam, outcome: { $in: outcome } })),
  };
}

function selectedThemeScope(assignments, curriculum) {
  return assignments.map((assignment) => {
    const subject = curriculum.find(({ subject: row }) => String(row._id) === String(assignment.subject));
    const theme = subject?.themes.find((row) => row.key === assignment.themeKey);
    return {
      assignment: String(assignment._id),
      sourceExam: String(assignment.exam),
      subject: String(assignment.subject),
      subjectTitle: subject?.subject?.titleEn || '',
      themeKey: assignment.themeKey,
      themeTitle: theme?.titleEn || theme?.titleNe || assignment.themeKey,
    };
  });
}

function resultAssessmentFilter(data, examIds = []) {
  return assessmentExamFilter({ ...data, examIds });
}

/**
 * Progress reports and publication to the Pravyo parent dashboard.
 *
 * A published report holds a SNAPSHOT, not a live view. Once published, what a
 * guardian sees must not move because a teacher recorded another outcome the
 * next week — so publication freezes the figures, and a published report's
 * results are locked against further edits.
 */

/**
 * A grade's subjects, each with its active themes and their outcomes in book
 * order.
 *
 * Exam assignments determine current coverage; stored outcomes keep marks
 * visible in merged results even if an assignment is later adjusted.
 */
async function loadGradeCurriculum(actor, grade, {
  academicYear, examId, examIds = [], resultMode = 'EXAM', themeAssignments,
} = {}) {
  const [subjects, outcomes] = await Promise.all([
    CasSubject.find({ school: actor.school, grade, status: 'ACTIVE', ...EXAMINED_FILTER })
      .sort({ sequence: 1, titleEn: 1 })
      .lean(),
    CasLearningOutcome.find({ school: actor.school, grade, status: 'ACTIVE' })
      .sort({ sequence: 1, _id: 1 })
      .lean(),
  ]);

  const assignments = themeAssignments || (academicYear && (examId || resultMode === 'MERGED')
    ? await CasThemeExam.find({
        school: actor.school,
        academicYear,
        grade,
        ...(resultMode !== 'MERGED' && examId ? { exam: { $in: examIds.length ? examIds : [examId] } } : {}),
      }).select('_id exam subject themeKey').lean()
    : []);
  const assigned = new Map();
  for (const assignment of assignments) {
    const key = String(assignment.subject);
    if (!assigned.has(key)) assigned.set(key, new Set());
    assigned.get(key).add(assignment.themeKey);
  }

  return subjects.map((subject) => {
    const own = outcomes.filter((o) => String(o.subject) === String(subject._id));
    const themes = groupThemes(own, subject)
      .filter((theme) => theme.outcomeCount > 0)
      .filter((theme) => !academicYear || (!examId && resultMode !== 'MERGED') || assigned.get(String(subject._id))?.has(theme.key))
      .map((theme) => ({
        key: theme.key,
        titleEn: theme.titleEn || '',
        titleNe: theme.titleNe || '',
        sequence: theme.sequence || null,
        sent: Boolean(assigned.get(String(subject._id))?.has(theme.key)),
        outcomes: own.filter((o) => themeIdentity(o) === theme.key),
      }));
    return { subject, themes };
  });
}

/** Remark printed for a subject the student has no assessment in at all. */
export const NOT_ATTENDED_REMARK = { en: 'Not attended exam', ne: 'परीक्षामा अनुपस्थित' };

/**
 * One student's result from already-loaded curriculum and attempts.
 * Pure over its inputs; saves nothing.
 *
 * `missingPolicy` is the exam's missing-work rule ({ missingWork,
 * missingWorkLevel }, see CasExam). It is passed only when the school chose
 * "Publish anyway" with marks still missing:
 *   DEFAULT_LEVEL — every unassessed outcome is scored missingWorkLevel (0-4);
 *   ABSENT        — a subject with nothing assessed is "Not attended exam":
 *                   no grade, so it is left out of the GPA.
 * Without it, unassessed outcomes are simply left out (the normal rule).
 */
function computeResult(curriculum, attemptsByOutcome, resultMode = 'EXAM', missingPolicy = null) {
  const missingLevel = missingPolicy?.missingWork === 'DEFAULT_LEVEL'
    ? Number(missingPolicy.missingWorkLevel) || 0
    : null;
  const markAbsent = missingPolicy?.missingWork === 'ABSENT';
  const perSubject = curriculum.map(({ subject, themes: allThemes }) => {
    const themes = allThemes.filter((theme) => resultMode === 'MERGED'
      ? theme.outcomes.some((o) => (attemptsByOutcome[String(o._id)] || []).length > 0)
      : theme.sent || theme.outcomes.some((o) => (attemptsByOutcome[String(o._id)] || []).length > 0));
    const own = themes.flatMap((theme) => theme.outcomes);
    const result = subjectResult({
      subjectCode: subject.code,
      outcomes: own.map((o) => ({ code: String(o._id) })),
      attemptsByOutcome,
    });
    const levelOf = (o) => getAcceptedLevel(attemptsByOutcome[String(o._id)] || []);
    // The step-wise sheet: theme rows, pooled subject percentage, then the
    // grade point from page 6 of the evaluation record.
    const sheet = subjectResultSheet({
      creditHours: subject.creditHours ?? null,
      themes: themes.map((theme) => ({ ...theme, levels: theme.outcomes.map(levelOf) })),
      missingLevel,
    });
    // Filled by the default level: the figures come from the filled sheet so
    // the card's achievement, outcomes and totals all agree with each other.
    const filled = sheet.filled
      ? {
          assessedCount: sheet.assessments,
          achievement: sheet.percent,
          averageLevel: sheet.assessments ? Math.round((sheet.obtained / sheet.assessments) * 100) / 100 : null,
          coverage: 100,
          fullyAssessed: true,
          filledByDefault: sheet.filled,
        }
      : {};
    const absent = markAbsent && result.outcomeCount > 0 && result.assessedCount === 0;

    return {
      ...result,
      ...filled,
      ...(absent ? { absent: true } : {}),
      titleEn: subject.titleEn,
      titleNe: subject.titleNe || '',
      creditHours: sheet.creditHours,
      gradePoint: sheet.gradePoint,
      grade: sheet.grade,
      remarkEn: absent ? NOT_ATTENDED_REMARK.en : sheet.remarkEn,
      remarkNe: absent ? NOT_ATTENDED_REMARK.ne : sheet.remarkNe,
      obtained: sheet.obtained,
      fullMarks: sheet.fullMarks,
      weightedGradePoint: sheet.weightedGradePoint,
      themes: sheet.themes,
      outcomes: own.map((o) => {
        const attempts = attemptsByOutcome[String(o._id)] || [];
        return {
          code: o.code,
          themeEn: o.themeEn || '',
          themeNe: o.themeNe || '',
          titleEn: o.titleEn || '',
          titleNe: o.titleNe || '',
          acceptedLevel: getAcceptedLevel(attempts),
          attemptCount: attempts.length,
        };
      }),
    };
  });

  // Credit-hour weighted, exactly as the book's grade sheet computes it.
  const summary = finalResult(perSubject);

  return {
    subjects: perSubject,
    total: consolidate(perSubject),
    gpa: summary.gpa,
    overallGrade: summary.grade,
    overallRemarkEn: summary.remarkEn,
    overallRemarkNe: summary.remarkNe,
    totalCreditHours: summary.totalCreditHours,
    totalWeightedGradePoints: summary.totalWeightedGradePoints,
  };
}

function attemptsByOutcomeOf(assessments) {
  const grouped = new Map();
  for (const assessment of assessments) {
    const key = String(assessment.outcome);
    grouped.set(key, [...(grouped.get(key) || []), ...(assessment.attempts || [])]);
  }
  return Object.fromEntries(grouped);
}

/**
 * The part of a grade's curriculum one student actually takes: compulsory
 * subjects offered to their section, plus the optional subjects the school
 * assigned them. A student is never marked on a subject they do not take.
 */
function curriculumFor(curriculum, student) {
  return student ? curriculum.filter(({ subject }) => studentTakesSubject(subject, student)) : curriculum;
}

/** Compute one student's results for a year. Saves nothing. */
export async function buildResult(actor, {
  academicYear,
  grade,
  student,
  examId,
  resultMode = 'EXAM',
  includePrevious = false,
  examIds: suppliedExamIds,
  themeAssignments: suppliedThemeAssignments,
  themeAssignmentIds,
  studentProfile,
  missingPolicy = null,
}) {
  requireSchoolAdmin(actor);
  await connectDB();
  const profile = studentProfile
    || await Student.findById(student).select('section subjectChoices').lean();
  const themeAssignments = suppliedThemeAssignments || await resolveThemeAssignments(actor, {
    academicYear, grade, themeAssignmentIds,
  });
  const examIds = suppliedExamIds || await resolveExamIds(actor, {
    academicYear, grade, examId, includePrevious, resultMode,
  });
  const data = { examId, includePrevious, resultMode };
  const curriculum = await loadGradeCurriculum(actor, grade, {
    academicYear, examId, examIds, resultMode, themeAssignments,
  });
  const assessments = await CasAssessment.find({
    school: actor.school,
    academicYear,
    grade,
    student,
    ...(themeAssignments
      ? selectedThemeAssessmentFilter(themeAssignments, curriculum)
      : resultAssessmentFilter(data, examIds)),
  }).lean();
  return computeResult(curriculumFor(curriculum, profile), attemptsByOutcomeOf(assessments), resultMode, missingPolicy);
}

/**
 * The live final result for every student in a grade — what Student Result
 * shows before anything is published. Three reads for the whole grade rather
 * than three per student.
 */
export async function loadGradeResults(actor, input) {
  requireSchoolAdmin(actor);
  const data = gradeResultsQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const exam = data.examId ? await CasExam.findOne({ _id: data.examId, school: actor.school, academicYear: year.id, status: { $in: ['ACTIVE', 'ARCHIVED'] }, mergedInto: { $exists: false } }).lean() : null;
  assert(!data.examId || exam, 'Exam unavailable for this grade and year', 404);
  const themeAssignments = await resolveThemeAssignments(actor, {
    academicYear: year.id, grade: data.grade, themeAssignmentIds: data.themeAssignmentIds,
  });
  const examIds = await resolveExamIds(actor, { ...data, academicYear: year.id });
  if (!usesResultSheet(data.grade)) {
    return { year, grade: data.grade, resultAvailable: false, subjects: [], students: [] };
  }
  const [roster, curriculum] = await Promise.all([
    loadStudents(actor, { grade: data.grade, yearStart: year.yearStart, history: true }),
    loadGradeCurriculum(actor, data.grade, {
      academicYear: year.id, examId: data.examId, examIds, resultMode: data.resultMode, themeAssignments,
    }),
  ]);
  const ids = roster.map((student) => student.id);
  const [assessments, reports] = await Promise.all([
    CasAssessment.find({
      school: actor.school,
      academicYear: year.id,
      grade: data.grade,
      student: { $in: ids },
      ...(themeAssignments
        ? selectedThemeAssessmentFilter(themeAssignments, curriculum)
        : resultAssessmentFilter(data, examIds)),
    })
      .select('student outcome attempts')
      .lean(),
    CasReport.find(withReportTerm({
      school: actor.school,
      academicYear: year.id,
      student: { $in: ids },
    }, data.examTerm, data.examId, data.resultMode, data.includePrevious, data.themeAssignmentIds))
      .select('student status format examTerm publishedAt generatedAt')
      .lean(),
  ]);

  const assessmentsByStudent = new Map();
  for (const row of assessments) {
    const key = String(row.student);
    if (!assessmentsByStudent.has(key)) assessmentsByStudent.set(key, []);
    assessmentsByStudent.get(key).push(row);
  }
  const reportByStudent = new Map(reports.map((row) => [String(row.student), row]));

  return {
    year,
    grade: data.grade,
    resultAvailable: true,
    subjects: curriculum.map(({ subject }) => ({
      id: String(subject._id),
      code: subject.code,
      titleEn: subject.titleEn,
      titleNe: subject.titleNe || '',
      creditHours: subject.creditHours ?? null,
    })),
    students: roster.map((student) => {
      const result = computeResult(
        curriculumFor(curriculum, student),
        attemptsByOutcomeOf(assessmentsByStudent.get(student.id) || []),
        data.resultMode,
      );
      const report = reportByStudent.get(student.id);
      return {
        ...student,
        result: {
          ...result,
          // The per-outcome list is for the printed sheet; the screen needs
          // only the theme rows.
          subjects: result.subjects.map(({ outcomes, ...subject }) => subject),
        },
        report: report
          ? {
              id: String(report._id),
              status: report.status,
              format: report.format,
              publishedAt: report.publishedAt || null,
              generatedAt: report.generatedAt || null,
            }
          : null,
      };
    }),
  };
}

/**
 * What a report card is drawn from. The same builder feeds a published
 * snapshot and Student Result's live preview, so the card a school looks at
 * before publishing is the card the parent opens afterwards.
 */
function buildSnapshot({
  actor,
  school,
  year,
  grade,
  student,
  result,
  format,
  record,
  issueDate,
  examTerm = DEFAULT_CAS_EXAM_TERM,
  examTitle,
  examId,
  resultMode = 'EXAM',
  includePrevious = false,
  selectedThemes = [],
}) {
  return {
    examTerm,
    examTitle: examTitle || normalizeExamTitle(examTerm, examTitle),
    examId: examId || null,
    resultMode,
    includePrevious,
    selectedThemes,
    // The exam's issue date from Manage Exams, in B.S. ("2083/06/08"), printed as-is.
    issueDate: issueDate || null,
    school: {
      name: school.name,
      address: school.address,
      principalName: school.principalName,
      schoolCode: school.schoolCode,
      iemisNumber: school.iemisNumber,
      phone: school.phone,
    },
    student: {
      name: student.name,
      grade,
      rollNumber: student.rollNumber || '',
      registrationNumber: student.registrationNumber || '',
      iemisNumber: student.iemisNumber || '',
      section: student.section || '',
    },
    academicYear: { label: year.label, labelAd: year.labelAd || '', yearStart: year.yearStart },
    subjects: result.subjects,
    total: result.total,
    gpa: result.gpa,
    overallGrade: result.overallGrade,
    overallRemarkEn: result.overallRemarkEn,
    overallRemarkNe: result.overallRemarkNe,
    totalCreditHours: result.totalCreditHours,
    totalWeightedGradePoints: result.totalWeightedGradePoints,
    format,
    attendance: normalizeAttendance(record?.attendance),
    extraActivities: normalizeExtraActivities(record?.extraActivities),
    generatedBy: actor.name,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Every student's report card in a grade, ready to show or print.
 *
 * A published student gets the stored snapshot — exactly what their parent
 * sees. Everyone else gets a live preview in the chosen format, built the way
 * publishing would build it but never saved. A student with nothing assessed
 * has no card.
 */
export async function loadGradeReportCards(actor, input) {
  requireSchoolAdmin(actor);
  const data = reportCardsQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const exam = data.examId ? await CasExam.findOne({ _id: data.examId, school: actor.school, academicYear: year.id, status: { $in: ['ACTIVE', 'ARCHIVED'] }, mergedInto: { $exists: false } }).lean() : null;
  assert(!data.examId || exam, 'Exam unavailable for this grade and year', 404);
  const presentation = await examReportPresentation(actor, year, exam, data.examTitle);
  const themeAssignments = await resolveThemeAssignments(actor, {
    academicYear: year.id, grade: data.grade, themeAssignmentIds: data.themeAssignmentIds,
  });
  const examIds = await resolveExamIds(actor, { ...data, academicYear: year.id });
  if (!usesResultSheet(data.grade)) {
    return { year, grade: data.grade, resultAvailable: false, students: [] };
  }
  const [school, roster, curriculum] = await Promise.all([
    loadSchool(actor),
    loadStudents(actor, { grade: data.grade, yearStart: year.yearStart, history: true }),
    loadGradeCurriculum(actor, data.grade, {
      academicYear: year.id, examId: data.examId, examIds, resultMode: data.resultMode, themeAssignments,
    }),
  ]);
  const wanted = data.students?.length ? new Set(data.students) : null;
  const sections = sectionsForGrade(school.gradeSections, data.grade);
  assert(!data.section || sections.includes(data.section), 'Choose a section configured for this grade', 400);
  const students = roster.filter((student) =>
    (!wanted || wanted.has(student.id)) && (!data.section || student.section === data.section));
  const ids = students.map((student) => student.id);
  const [assessments, reports, records] = await Promise.all([
    CasAssessment.find({
      school: actor.school,
      academicYear: year.id,
      grade: data.grade,
      student: { $in: ids },
      ...(themeAssignments
        ? selectedThemeAssessmentFilter(themeAssignments, curriculum)
        : resultAssessmentFilter(data, examIds)),
    })
      .select('student outcome attempts')
      .lean(),
    CasReport.find(withReportTerm({
      school: actor.school,
      academicYear: year.id,
      student: { $in: ids },
    }, data.examTerm, data.examId, data.resultMode, data.includePrevious, data.themeAssignmentIds)).lean(),
    loadResultRecords(actor, year.id, data.grade, ids, data),
  ]);
  const byStudent = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = String(row.student);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  };
  const assessmentsByStudent = byStudent(assessments);
  const reportByStudent = new Map(reports.map((row) => [String(row.student), row]));
  const recordByStudent = records;
  const branding = (await loadReportBranding(actor.school)).get(String(actor.school));

  return {
    year,
    grade: data.grade,
    section: data.section || '',
    sections,
    resultAvailable: true,
    students: students.map((student) => {
      const identity = { id: student.id, name: student.name, rollNumber: student.rollNumber || '' };
      const stored = reportByStudent.get(student.id);
      // The student's live details print on the card (a section only when the
      // school configured it for the grade; loadStudents drops any other).
      const studentBranding = {
        ...branding,
        studentIemis: student.iemisNumber || '',
        studentName: student.name || '',
        studentRoll: student.rollNumber || '',
        studentSection: student.section || '',
      };
      if (stored?.status === 'PUBLISHED') {
        return { ...identity, status: 'PUBLISHED', report: { ...serializeReport(stored), branding: studentBranding } };
      }
      const result = computeResult(
        curriculumFor(curriculum, student),
        attemptsByOutcomeOf(assessmentsByStudent.get(student.id) || []),
        data.resultMode,
      );
      if (result.total.assessedCount === 0) {
        return { ...identity, status: 'NOT_ASSESSED', report: null };
      }
      return {
        ...identity,
        status: 'PREVIEW',
        coverage: result.total.coverage,
        fullyAssessed: result.total.fullyAssessed,
        report: {
          id: null,
          branding: studentBranding,
          student: student.id,
          grade: data.grade,
          status: 'PREVIEW',
          format: data.format,
          examTerm: data.examTerm,
          exam: data.examId || null,
          resultMode: data.resultMode,
          includePrevious: data.includePrevious,
          publishedAt: null,
          generatedAt: null,
          snapshot: buildSnapshot({
            actor,
            school,
            year,
            grade: data.grade,
            student: {
              ...student,
              section: sections.includes(student.section) ? student.section : '',
            },
            result,
            format: data.format, record: recordByStudent.get(student.id),
            issueDate: presentation.issueDate,
            examTerm: data.examTerm,
            examTitle: presentation.examTitle,
            examId: data.examId,
            resultMode: data.resultMode,
            includePrevious: data.includePrevious,
            selectedThemes: themeAssignments ? selectedThemeScope(themeAssignments, curriculum) : [],
          }),
        },
      };
    }),
  };
}

/**
 * Attendance and extra activities for each student's card, by student id.
 *
 * An exam's card uses the figures recorded for that exam. Until a school has
 * recorded them, it falls back to the whole-year record, which is where all
 * attendance lived before it was kept per exam. A merged result uses the
 * whole-year record.
 */
async function loadResultRecords(actor, academicYear, grade, studentIds, { examId, resultMode } = {}) {
  const exam = resultMode === 'MERGED' ? null : examId || null;
  const rows = await CasStudentRecord.find({
    school: actor.school,
    academicYear,
    grade,
    student: { $in: studentIds },
    exam: exam ? { $in: [exam, null] } : null,
  }).lean();
  const byStudent = new Map();
  for (const row of rows) {
    const key = String(row.student);
    if (!byStudent.has(key) || row.exam) byStudent.set(key, row);
  }
  return byStudent;
}

export function serializeReport(row) {
  return {
    id: String(row._id),
    student: String(row.student),
    grade: row.grade,
    status: row.status,
    format: row.format || row.snapshot?.format || 'CLASSIC',
    examTerm: row.examTerm || row.snapshot?.examTerm || DEFAULT_CAS_EXAM_TERM,
    includePrevious: row.includePrevious ?? row.snapshot?.includePrevious ?? false,
    themeAssignmentIds: (row.themeAssignments || []).map(String),
    snapshot: row.snapshot,
    generatedAt: row.generatedAt || null,
    publishedAt: row.publishedAt || null,
  };
}

/**
 * Create or refresh DRAFT reports for a set of students.
 *
 * `missingPolicy` (the exam's missing-work rule) is given only by "Publish
 * anyway": it completes each result, and then a student with nothing assessed
 * still gets a card (every subject "Not attended exam", or the default level).
 */
export async function generateReports(actor, input, { missingPolicy = null } = {}) {
  requireSchoolAdmin(actor);
  const data = reportInput.parse(input);
  // Every snapshot and publication goes through here, so this one check keeps
  // a Grade 6-10 result from being generated or reaching a parent.
  assert(usesResultSheet(data.grade), RESULT_SHEET_UNAVAILABLE, 409);
  await connectDB();
  await ensureCasIndexes();

  const [school, year] = await Promise.all([
    loadSchool(actor),
    loadAcademicYear(actor, data.academicYear),
  ]);
  const sections = sectionsForGrade(school.gradeSections, data.grade);
  assert(!data.section || sections.includes(data.section), 'Choose a section configured for this grade', 400);
  const exam = data.examId
    ? await CasExam.findOne({ _id: data.examId, school: actor.school, academicYear: year.id, status: { $in: ['ACTIVE', 'ARCHIVED'] }, mergedInto: { $exists: false } }).lean()
    : null;
  assert(!data.examId || exam, 'Exam unavailable for this academic year', 404);
  const presentation = await examReportPresentation(actor, year, exam, data.examTitle);
  assert(
    presentation.issueDate,
    exam
      ? `Set the issue date for ${exam.name} in Manage Exams before publishing its report cards.`
      : 'Set an issue date on an exam in Manage Exams before publishing the whole-year report cards.',
    409,
  );
  const themeAssignments = await resolveThemeAssignments(actor, {
    academicYear: year.id, grade: data.grade, themeAssignmentIds: data.themeAssignmentIds,
  });
  const examIds = await resolveExamIds(actor, { ...data, academicYear: year.id });
  const scopeCurriculum = themeAssignments
    ? await loadGradeCurriculum(actor, data.grade, {
        academicYear: year.id,
        examId: data.examId,
        examIds,
        resultMode: data.resultMode,
        themeAssignments,
      })
    : null;
  const selectedThemes = scopeCurriculum ? selectedThemeScope(themeAssignments, scopeCurriculum) : [];
  const roster = await loadStudents(actor, {
    grade: data.grade,
    yearStart: year.yearStart,
  });
  const rosterById = new Map(roster.map((s) => [s.id, s]));
  const recordByStudent = await loadResultRecords(actor, year.id, data.grade, data.students, data);

  const created = [];
  const skipped = [];

  for (const studentId of data.students) {
    const student = rosterById.get(studentId);
    if (!student || (data.section && student.section !== data.section)) {
      skipped.push({ student: studentId, reason: 'Not enrolled in this grade, section, and academic year' });
      continue;
    }

    const identity = {
      school: actor.school,
      academicYear: year.id,
      student: studentId,
      resultKey: resultKey(data),
      ...(data.examId ? { exam: data.examId } : {}),
      resultMode: data.resultMode,
      includePrevious: data.includePrevious,
    };
    const existingReport = await CasReport.findOne(withReportTerm({
      school: actor.school,
      academicYear: year.id,
      student: studentId,
    }, data.examTerm, data.examId, data.resultMode, data.includePrevious, data.themeAssignmentIds)).lean();
    if (existingReport?.status === 'PUBLISHED') {
      skipped.push({
        student: studentId,
        name: student.name,
        reason: 'Already published — a published report cannot be regenerated',
      });
      continue;
    }

    const result = await buildResult(actor, {
      academicYear: year.id,
      grade: data.grade,
      student: studentId,
      studentProfile: student,
      examId: data.examId,
      resultMode: data.resultMode,
      includePrevious: data.includePrevious,
      examIds,
      themeAssignments,
      themeAssignmentIds: data.themeAssignmentIds,
      missingPolicy,
    });

    if (result.total.assessedCount === 0 && !missingPolicy) {
      skipped.push({
        student: studentId,
        name: student.name,
        reason: 'Nothing assessed yet',
      });
      continue;
    }

    const snapshot = buildSnapshot({
      actor,
      school,
      year,
      grade: data.grade,
      student: {
        ...student,
        section: sections.includes(student.section) ? student.section : '',
      },
      result,
      format: data.format, record: recordByStudent.get(studentId), issueDate: presentation.issueDate,
      examTerm: data.examTerm,
      examTitle: presentation.examTitle,
      examId: data.examId,
      resultMode: data.resultMode,
      includePrevious: data.includePrevious,
      selectedThemes,
    });

    const saved = await CasReport.findOneAndUpdate(
      existingReport
        ? {
            _id: existingReport._id,
            school: actor.school,
            status: 'DRAFT',
            ...revisionFilter(existingReport),
          }
        : {
            ...identity,
            status: 'DRAFT',
            assessmentRevision: { $exists: false },
          },
      {
        $set: {
          snapshot,
          format: data.format,
          examTerm: data.examTerm,
          exam: data.examId || null,
          resultKey: resultKey(data),
          resultMode: data.resultMode,
          includePrevious: data.includePrevious,
          themeAssignments: themeAssignments?.map((row) => row._id) || [],
          generatedBy: actor.id,
          generatedAt: new Date(),
          status: 'DRAFT',
          generatedAssessmentRevision: existingReport?.assessmentRevision ?? 0,
        },
        $setOnInsert: {
          grade: data.grade,
        },
      },
      { returnDocument: 'after', upsert: !existingReport },
    ).lean();
    assert(saved, 'Assessment results changed while generating the report. Generate it again.', 409);

    created.push(serializeReport(saved));
  }

  return { created, skipped };
}

export async function loadReports(actor, {
  academicYear,
  grade,
  status,
  section,
  exam,
  format,
  search,
  student,
} = {}) {
  requireSchoolAdmin(actor);
  await connectDB();
  const query = {
    school: actor.school,
    ...(academicYear ? { academicYear } : {}),
    ...(grade ? { grade } : {}),
    // One student's cards (Published Results → Student).
    ...(/^[a-f\d]{24}$/i.test(String(student || '')) ? { student } : {}),
    ...(status ? { status } : {}),
    ...(section ? { 'snapshot.student.section': section } : {}),
    // WHOLE_YEAR = cards that belong to no exam (the whole-year final result).
    ...(exam ? { exam: exam === WHOLE_YEAR_EXAM ? null : exam } : {}),
    ...(format ? { format } : {}),
  };
  const trimmedSearch = String(search || '').trim();
  if (trimmedSearch) {
    const escaped = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { 'snapshot.student.name': { $regex: escaped, $options: 'i' } },
      { 'snapshot.student.rollNumber': { $regex: escaped, $options: 'i' } },
      { 'snapshot.examTitle': { $regex: escaped, $options: 'i' } },
    ];
  }
  const rows = await CasReport.find(query).sort({ publishedAt: -1, generatedAt: -1 }).limit(500).lean();
  return withBranding(actor.school, rows.map(serializeReport));
}

/**
 * Sections to filter published results by: the grade's live sections, plus
 * any section a published card was issued under. Deleting a section takes it
 * off every working screen, but its published results must stay findable.
 */
export async function loadPublishedSections(actor, { academicYear, grade }) {
  requireSchoolAdmin(actor);
  await connectDB();
  const year = await loadAcademicYear(actor, academicYear);
  const [school, issued] = await Promise.all([
    loadSchool(actor),
    CasReport.distinct('snapshot.student.section', {
      school: actor.school,
      academicYear: year.id,
      grade,
      status: 'PUBLISHED',
    }),
  ]);
  const live = sectionsForGrade(school.gradeSections, grade);
  return [...new Set([...live, ...issued.map((value) => String(value || '').trim()).filter(Boolean)])]
    .sort((left, right) => left.localeCompare(right));
}

export async function loadReport(actor, id) {
  requireSchoolAdmin(actor);
  await connectDB();
  const row = await CasReport.findOne({ _id: id, school: actor.school }).lean();
  assert(row, 'Report unavailable', 404);
  const [report] = await withBranding(actor.school, [serializeReport(row)]);
  return report;
}

/**
 * DRAFT -> PUBLISHED, one way.
 *
 * Publishing makes the report visible in the existing Pravyo parent and student
 * dashboards. Nothing is copied to another database — they read this same
 * collection.
 */
export async function publishReports(actor, input) {
  requireSchoolAdmin(actor);
  const data = publishInput.parse(input);
  await connectDB();

  const reports = await CasReport.find({
    _id: { $in: data.reports },
    school: actor.school,
  }).lean();
  assert(reports.length > 0, 'No reports found to publish', 404);

  const publishAt = resolvePublishAt(data.publishDate);
  const published = [];
  const failed = [];

  for (const report of reports) {
    try {
      if (report.status === 'PUBLISHED') {
        published.push(serializeReport(report));
        continue;
      }
      assert(
        (report.assessmentRevision ?? 0) === (report.generatedAssessmentRevision ?? 0),
        'Assessment results changed after this report was generated. Generate it again before publishing.',
        409,
      );
      const saved = await CasReport.findOneAndUpdate(
        { _id: report._id, school: actor.school, status: 'DRAFT', ...revisionFilter(report) },
        {
          $set: {
            status: 'PUBLISHED',
            publishedAt: publishAt,
            publishedBy: actor.id,
          },
        },
        { returnDocument: 'after' },
      ).lean();
      assert(saved, 'This report changed while publishing. Reload and try again.', 409);

      if (isVisibleNow(publishAt)) {
        await notifyForReport(saved);
      }
      published.push(serializeReport(saved));
    } catch (error) {
      failed.push({ report: String(report._id), reason: error.message });
    }
  }

  return { published, failed };
}

/**
 * Everything needed to publish one result scope for a WHOLE grade: who is
 * still unpublished, and every subject a student has not been fully assessed
 * in. A subject counts only if this result has outcomes for it.
 */
async function gradePublishPlan(actor, data) {
  const year = await loadAcademicYear(actor, data.academicYear);
  const exam = data.examId
    ? await CasExam.findOne({ _id: data.examId, school: actor.school, academicYear: year.id, status: { $in: ['ACTIVE', 'ARCHIVED'] }, mergedInto: { $exists: false } }).lean()
    : null;
  assert(!data.examId || exam, 'Exam unavailable for this academic year', 404);
  const presentation = await examReportPresentation(actor, year, exam, data.examTitle);
  const themeAssignments = await resolveThemeAssignments(actor, {
    academicYear: year.id, grade: data.grade, themeAssignmentIds: data.themeAssignmentIds,
  });
  const examIds = await resolveExamIds(actor, { ...data, academicYear: year.id });
  const [roster, curriculum] = await Promise.all([
    loadStudents(actor, { grade: data.grade, yearStart: year.yearStart }),
    loadGradeCurriculum(actor, data.grade, {
      academicYear: year.id, examId: data.examId, examIds, resultMode: data.resultMode, themeAssignments,
    }),
  ]);
  const ids = roster.map((student) => student.id);
  const [assessments, reports] = await Promise.all([
    CasAssessment.find({
      school: actor.school,
      academicYear: year.id,
      grade: data.grade,
      student: { $in: ids },
      ...(themeAssignments
        ? selectedThemeAssessmentFilter(themeAssignments, curriculum)
        : resultAssessmentFilter(data, examIds)),
    }).select('student outcome attempts').lean(),
    CasReport.find(withReportTerm({
      school: actor.school,
      academicYear: year.id,
      student: { $in: ids },
    }, data.examTerm, data.examId, data.resultMode, data.includePrevious, data.themeAssignmentIds))
      .select('student status').lean(),
  ]);
  const assessmentsByStudent = new Map();
  for (const row of assessments) {
    const key = String(row.student);
    if (!assessmentsByStudent.has(key)) assessmentsByStudent.set(key, []);
    assessmentsByStudent.get(key).push(row);
  }
  const publishedIds = new Set(reports.filter((row) => row.status === 'PUBLISHED').map((row) => String(row.student)));
  const pending = roster.filter((student) => !publishedIds.has(student.id));
  const missing = [];
  for (const student of pending) {
    const result = computeResult(
      curriculumFor(curriculum, student),
      attemptsByOutcomeOf(assessmentsByStudent.get(student.id) || []),
      data.resultMode,
    );
    for (const subject of result.subjects) {
      if (subject.outcomeCount > 0 && !subject.fullyAssessed) {
        missing.push({
          student: student.id,
          name: student.name,
          rollNumber: student.rollNumber || '',
          section: student.section || '',
          subjectEn: subject.titleEn,
          subjectNe: subject.titleNe || '',
          assessed: subject.assessedCount,
          outcomes: subject.outcomeCount,
        });
      }
    }
  }
  return {
    exam,
    total: roster.length,
    alreadyPublished: roster.length - pending.length,
    pending,
    missing,
    issueDate: presentation.issueDate || '',
    policy: missingWorkOf(exam),
  };
}

/**
 * Publish a result for the WHOLE grade — every section, every student not yet
 * published — never a chosen few. (Used by Student Result and Manage Exams.)
 *
 * Every student must be assessed in every subject of the result first. With
 * `checkOnly` it only reports the plan and the missing marks. With marks
 * missing it refuses, unless `publishAnyway`: then the exam's missing-work
 * rule (Manage Exams) completes each result — "Not attended exam", or the
 * school's default level.
 *
 * Built from generateReports + publishReports, so the stale-result check, the
 * lock and the guardian notification all still apply. The card's issue date
 * is the exam's.
 */
export async function publishGradeResults(actor, input) {
  requireSchoolAdmin(actor);
  const data = gradePublishInput.parse(input);
  assert(usesResultSheet(data.grade), RESULT_SHEET_UNAVAILABLE, 409);
  await connectDB();
  const plan = await gradePublishPlan(actor, data);
  const missingStudents = new Set(plan.missing.map((row) => row.student)).size;
  const summary = {
    examName: plan.exam?.name || '',
    issueDate: plan.issueDate,
    total: plan.total,
    alreadyPublished: plan.alreadyPublished,
    toPublish: plan.pending.length,
    missing: plan.missing,
    missingStudents,
    missingWork: plan.policy,
  };
  if (data.checkOnly) return summary;

  assert(plan.total, `No students are enrolled in ${data.grade} for this academic year.`, 409);
  assert(plan.pending.length, 'Every student in this grade is already published.', 409);
  assert(
    !plan.missing.length || data.publishAnyway,
    `${plan.missing.length} subject mark${plan.missing.length === 1 ? ' is' : 's are'} missing for ${missingStudents} student${missingStudents === 1 ? '' : 's'}. Enter them, or choose Publish anyway.`,
    409,
  );

  const missingPolicy = plan.missing.length ? plan.policy : null;
  const outcome = { published: [], failed: [], skipped: [] };
  const ids = plan.pending.map((student) => student.id);
  // generateReports and publishReports take at most 300 students per call.
  for (let start = 0; start < ids.length; start += 300) {
    const generated = await generateReports(actor, {
      academicYear: data.academicYear,
      grade: data.grade,
      students: ids.slice(start, start + 300),
      format: data.format,
      examTerm: data.examTerm,
      examId: data.examId,
      resultMode: data.resultMode,
      includePrevious: data.includePrevious,
      themeAssignmentIds: data.themeAssignmentIds,
      examTitle: data.examTitle,
    }, { missingPolicy });
    outcome.skipped.push(...generated.skipped);
    if (generated.created.length) {
      const published = await publishReports(actor, { reports: generated.created.map((row) => row.id) });
      outcome.published.push(...published.published);
      outcome.failed.push(...published.failed);
    }
  }
  return { ...outcome, completedMissing: plan.missing.length, missingWork: missingPolicy };
}

/**
 * Unpublish a whole exam for a grade: every section, every student, at once.
 *
 * Unpublishing DELETES the report cards (published and any stray drafts) and
 * the notifications that pointed at them. Nothing is kept: the results are
 * still in the assessments, and publishing the exam again from Student Result
 * builds fresh cards. Students' assessments unlock because no published card
 * exists any more.
 */
export async function unpublishExamResults(actor, input) {
  requireSchoolAdmin(actor);
  const data = examUnpublishInput.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const wholeYear = data.exam === WHOLE_YEAR_EXAM;
  if (!wholeYear) {
    const exam = await CasExam.exists({ _id: data.exam, school: actor.school, academicYear: year.id });
    assert(exam, 'Exam unavailable for this academic year', 404);
  }
  const filter = {
    school: actor.school,
    academicYear: year.id,
    grade: data.grade,
    exam: wholeYear ? null : data.exam,
  };
  const ids = (await CasReport.find(filter).select('_id').lean()).map((row) => row._id);
  if (!ids.length) return { unpublished: 0 };

  await CasReport.deleteMany({ _id: { $in: ids }, school: actor.school });
  await UserNotification.deleteMany({ entityId: { $in: ids.map(String) } });
  return { unpublished: ids.length };
}

/**
 * Manage Exams publishing.
 *
 * Publishing from Manage Exams uses exactly the scope Student Result opens
 * with — one exam, all of that exam's themes for the grade, the standard card
 * — and runs through publishGradeResults, so the stale-result check, the lock
 * and the guardian notification all still apply and both screens produce the
 * same card. Unpublishing is the existing whole-exam delete.
 */
async function examPublishScope(actor, year, grade, examId, { activeOnly = true } = {}) {
  const exam = await CasExam.findOne({
    _id: examId, school: actor.school, academicYear: year.id, mergedInto: { $exists: false },
    ...(activeOnly ? { status: 'ACTIVE' } : {}),
  }).lean();
  assert(exam, 'Exam unavailable for this academic year', 404);
  const themeAssignmentIds = (await CasThemeExam.find({
    school: actor.school, academicYear: year.id, grade, exam: exam._id,
  }).select('_id').lean()).map((row) => String(row._id));
  return {
    exam,
    scope: {
      academicYear: String(year.id),
      grade,
      format: 'CLASSIC',
      examTerm: DEFAULT_CAS_EXAM_TERM,
      examId: String(exam._id),
      resultMode: 'EXAM',
      includePrevious: false,
      ...(themeAssignmentIds.length ? { themeAssignmentIds } : {}),
    },
  };
}

/**
 * One exam's publishing check for a whole grade — the same plan Student
 * Result's "Publish result" shows: how many students go out, how many are
 * already published, and every missing subject mark.
 */
async function examPublishSummary(actor, year, grade, examId) {
  const { exam, scope } = await examPublishScope(actor, year, grade, examId);
  if (!scope.themeAssignmentIds) {
    return {
      exam: String(exam._id), name: exam.name, hasThemes: false, issueDate: exam.issueDate || '',
      total: 0, alreadyPublished: 0, toPublish: 0, missing: [], missingStudents: 0, missingWork: missingWorkOf(exam), scope,
    };
  }
  const check = await publishGradeResults(actor, { ...scope, checkOnly: true });
  return {
    exam: String(exam._id),
    name: exam.name,
    hasThemes: true,
    ...check,
    issueDate: exam.issueDate || '',
    scope,
  };
}

/** Each exam's publication status for one grade, or one exam's summary. */
export async function loadExamPublishing(actor, input) {
  requireSchoolAdmin(actor);
  const data = examPublishingQuery.parse(input);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  if (data.exam) {
    const { scope, ...summary } = await examPublishSummary(actor, year, data.grade, data.exam);
    return summary;
  }
  const [roster, published] = await Promise.all([
    loadStudents(actor, { grade: data.grade, yearStart: year.yearStart }),
    CasReport.find({
      school: actor.school, academicYear: year.id, grade: data.grade,
      status: 'PUBLISHED', exam: { $ne: null },
    }).select('exam student').lean(),
  ]);
  const studentsByExam = new Map();
  for (const report of published) {
    const key = String(report.exam);
    if (!studentsByExam.has(key)) studentsByExam.set(key, new Set());
    studentsByExam.get(key).add(String(report.student));
  }
  return {
    students: roster.length,
    exams: [...studentsByExam].map(([exam, students]) => ({ exam, published: students.size })),
  };
}

/** Publish or unpublish one exam for the whole grade. */
export async function changeExamPublishing(actor, input) {
  requireSchoolAdmin(actor);
  const data = examPublishingAction.parse(input);
  if (data.action === 'unpublish') {
    return unpublishExamResults(actor, { academicYear: data.academicYear, grade: data.grade, exam: data.exam });
  }
  assert(usesResultSheet(data.grade), RESULT_SHEET_UNAVAILABLE, 409);
  await connectDB();
  const year = await loadAcademicYear(actor, data.academicYear);
  const { exam, scope } = await examPublishScope(actor, year, data.grade, data.exam);
  assert(scope.themeAssignmentIds, `Add themes to ${exam.name} for ${data.grade} before publishing.`, 409);
  // Whole grade, with the same missing-marks rule as Student Result.
  const outcome = await publishGradeResults(actor, { ...scope, publishAnyway: data.publishAnyway });
  return {
    published: outcome.published.length,
    failed: outcome.failed,
    skipped: outcome.skipped,
    completedMissing: outcome.completedMissing,
    missingWork: outcome.missingWork,
  };
}

function revisionFilter(report) {
  return report.assessmentRevision == null
    ? { assessmentRevision: { $exists: false } }
    : { assessmentRevision: report.assessmentRevision };
}

function resolvePublishAt(publishDate) {
  if (!publishDate) return new Date();
  const date = new Date(`${publishDate}T00:00:00+05:45`);
  assert(!Number.isNaN(date.getTime()), 'Use a valid publish date', 400);
  return date;
}

function isVisibleNow(date) {
  return date.getTime() <= Date.now();
}

/**
 * Tell guardians and the student that a report is available.
 *
 * Deliberately says nothing about levels. A push preview shows on a lock
 * screen, and a child's results are not lock-screen material.
 */
async function notifyForReport(report) {
  if (report.notifiedAt) return;
  const name = report.snapshot?.student?.name || 'your child';
  const grade = report.snapshot?.student?.grade || '';
  const examTitle = report.snapshot?.examTitle || 'result';
  const title = 'Student result published';
  const body = `${name}'s ${grade ? `${grade} ` : ''}${examTitle} is available under Student Result.`;

  try {
    const links = await ParentStudentLink.find({
      student: report.student,
      school: report.school,
      status: 'ACTIVE',
      canViewPortfolio: true,
    })
      .select('parent')
      .lean();

    if (links.length > 0) {
      await notifyGuardians({
        studentId: report.student,
        includeParentIds: links.map((l) => l.parent),
        type: 'RESULT',
        title,
        body,
        actionUrl: `/parent/learning/cas/${report._id}`,
        entityId: String(report._id),
        dedupeKey: `cas:${report._id}`,
      });
    }

    const studentNotice = await UserNotification.updateOne(
      {
        targetRole: 'STUDENT',
        recipientStudent: report.student,
        entityId: String(report._id),
        category: 'RESULT',
      },
      {
        $setOnInsert: {
          school: report.school,
          title,
          message: 'Your result is available under My Result.',
          href: `/student/learning/cas/${report._id}`,
          publishedAt: new Date(),
        },
      },
      { upsert: true },
    );
    // Ring the student's devices once, when the notification is first created.
    if (studentNotice.upsertedCount) {
      await sendAccountPush(
        { role: 'STUDENT', accountIds: [String(report.student)] },
        {
          notificationId: `result-${report._id}`,
          title: 'Your result is published',
          body: 'Your result is available under My Result.',
          href: `/student/learning/cas/${report._id}`,
        },
      );
    }

    await CasReport.updateOne({ _id: report._id }, { $set: { notifiedAt: new Date() } });
  } catch (error) {
    // Publication succeeded and must not roll back because a push failed.
    // Leaving notifiedAt unset lets a later retry deliver it.
    console.error('[cas] report published but notification failed', error);
  }
}
