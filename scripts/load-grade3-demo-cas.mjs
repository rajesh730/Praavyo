/**
 * Populate the Green Villege Grade 3 CAS demo through the same domain services
 * used by the application. It never publishes a report, so it sends no parent
 * or student notifications.
 *
 * This intentionally only fills missing regular assessments. It is safe to
 * resume after an interrupted run and never overwrites a teacher's saved mark.
 */
import process from 'node:process';
import dotenv from 'dotenv';
import connectDB from '@pravyo/db';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import CasThemeExam from '@pravyo/db/models/cas/CasThemeExam';
import CasReport from '@pravyo/db/models/cas/CasReport';
import { listExams } from '@pravyo/cas/lib/casExamService';
import { loadAcademicYear, loadStudents } from '@pravyo/cas/lib/casContext';
import { loadStudentSheet, saveSheet } from '@pravyo/cas/lib/casSheetService';
import { generateReports, loadGradeReportCards } from '@pravyo/cas/lib/casReportService';

dotenv.config({ path: '.env.local', quiet: true });

const SCHOOL_ID = '6a65ee5c1ea5833fc6a8e4b0';
const GRADE = 'Grade 3';
const PLAN = [
  { name: 'First Terminal Exam', term: 'FIRST', themeNumbers: [1, 2], date: '2026-04-15' },
  { name: 'Second Terminal Exam', term: 'SECOND', themeNumbers: [3, 4], date: '2026-07-15' },
  { name: 'Board Exam', term: 'FINAL', themeNumbers: [5, 6], date: '2026-10-01' },
];

const actor = {
  id: SCHOOL_ID,
  school: SCHOOL_ID,
  role: 'SCHOOL_ADMIN',
  name: 'Green Villege Secondary School',
  calendar: 'BS',
};

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function demoLevel({ studentIndex, subjectIndex, themeNumber, outcomeIndex }) {
  // Deliberately synthetic but varied, while avoiding reassessment cases.
  return 3 + ((studentIndex + subjectIndex + themeNumber + outcomeIndex) % 2);
}

function assignmentIdsFor(assignments, examId) {
  return assignments.filter((row) => row.exam === examId).map((row) => row.id);
}

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('This script writes live demo data. Re-run with --apply after reviewing its scope.');
  }

  await connectDB();
  const year = await loadAcademicYear(actor, '6a65ef23069cb37d4bd1df33');
  expect(year.status === 'ACTIVE', 'The Green Villege 2026-27 academic year is no longer active.');

  const [examData, students, subjects] = await Promise.all([
    listExams(actor, { academicYear: year.id, grade: GRADE, includeArchived: true }),
    loadStudents(actor, { grade: GRADE, yearStart: year.yearStart }),
    CasSubject.find({ school: actor.school, grade: GRADE, status: 'ACTIVE' })
      .sort({ sequence: 1, titleEn: 1 }).lean(),
  ]);
  expect(students.length === 18, `Expected 18 active Grade 3 students; found ${students.length}.`);
  expect(subjects.length === 4, `Expected four active Grade 3 subjects; found ${subjects.length}.`);

  const examsByName = new Map(examData.exams.map((exam) => [exam.name, exam]));
  for (const item of PLAN) {
    expect(examsByName.get(item.name)?.status === 'ACTIVE', `${item.name} is missing or is not active.`);
  }

  const assignments = examData.assignments;
  for (const item of PLAN) {
    const exam = examsByName.get(item.name);
    const own = assignments.filter((row) => row.exam === exam.id);
    expect(own.length === subjects.length * 2, `${item.name} must have exactly two themes assigned for each Grade 3 subject.`);
    for (const subject of subjects) {
      const expectedKeys = (subject.themes || [])
        .filter((theme) => (theme.status || 'ACTIVE') === 'ACTIVE')
        .sort((a, b) => (a.sequence || 1) - (b.sequence || 1))
        .filter((theme) => item.themeNumbers.includes(theme.sequence))
        .map((theme) => theme.key);
      expect(expectedKeys.length === 2, `${subject.titleEn} does not have the required themes for ${item.name}.`);
      const actualKeys = own.filter((row) => row.subject === String(subject._id)).map((row) => row.themeKey).sort();
      expect(JSON.stringify(actualKeys) === JSON.stringify([...expectedKeys].sort()),
        `${item.name} assignments for ${subject.titleEn} do not match the approved Grade 3 theme plan.`);
    }
  }

  let sheetsSaved = 0;
  let marksAdded = 0;
  if (!process.argv.includes('--reports-only')) {
  const sheetTasks = [];
  for (let studentIndex = 0; studentIndex < students.length; studentIndex += 1) {
    const student = students[studentIndex];
    for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex += 1) {
      const subject = subjects[subjectIndex];
      const themes = [...(subject.themes || [])]
        .filter((theme) => (theme.status || 'ACTIVE') === 'ACTIVE')
        .sort((a, b) => (a.sequence || 1) - (b.sequence || 1));
      for (const item of PLAN) {
        const exam = examsByName.get(item.name);
        for (const themeNumber of item.themeNumbers) {
          const theme = themes.find((row) => row.sequence === themeNumber);
          expect(theme, `${subject.titleEn} is missing theme ${themeNumber}.`);
          sheetTasks.push(async () => {
            const sheet = await loadStudentSheet(actor, {
              academicYear: year.id, exam: exam.id, grade: GRADE,
              subject: String(subject._id), themeKey: theme.key, student: student.id,
            });
            const missing = sheet.rows.filter((row) => row.regularLevel === null).length;
            if (!missing) return { sheets: 0, marks: 0 };
            const rows = sheet.rows.map((row, outcomeIndex) => row.regularLevel === null ? {
              outcome: row.outcome,
              revision: row.revision,
              regularLevel: demoLevel({ studentIndex, subjectIndex, themeNumber, outcomeIndex }),
              regularDate: item.date,
              remedialLevel: null,
              remedialDate: '',
              remarks: '',
            } : {
              outcome: row.outcome,
              revision: row.revision,
              regularLevel: row.regularLevel,
              regularDate: row.regularDate,
              remedialLevel: row.remedialLevel,
              remedialDate: row.remedialDate,
              remarks: row.remarks,
            });
            const saved = await saveSheet(actor, {
              academicYear: year.id, exam: exam.id, grade: GRADE,
              subject: String(subject._id), themeKey: theme.key, student: student.id, rows,
            });
            return { sheets: saved.saved, marks: missing };
          });
        }
      }
    }
  }

  let completedTasks = 0;
  let nextTask = 0;
  async function worker() {
    while (nextTask < sheetTasks.length) {
      const task = sheetTasks[nextTask++];
      const result = await task();
      sheetsSaved += result.sheets;
      marksAdded += result.marks;
      completedTasks += 1;
      if (completedTasks % 24 === 0 || completedTasks === sheetTasks.length) {
        console.log(`Completed ${completedTasks}/${sheetTasks.length} Grade 3 theme sheets`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  }

  const scopes = [
    { ...PLAN[0], assignmentIds: assignmentIdsFor(assignments, examsByName.get(PLAN[0].name).id) },
    { ...PLAN[1], assignmentIds: assignmentIdsFor(assignments, examsByName.get(PLAN[1].name).id) },
    // The Board result reuses themes 1-4 from the terminal assessments and
    // adds Board's 5-6. It never creates duplicate 1-4 Board assessments.
    { ...PLAN[2], assignmentIds: PLAN.flatMap((item) => assignmentIdsFor(assignments, examsByName.get(item.name).id)) },
  ];

  const reports = [];
  for (const scope of scopes) {
    const exam = examsByName.get(scope.name);
    expect(scope.assignmentIds.length === (scope.term === 'FINAL' ? 24 : 8), `${scope.name} result has an incomplete theme scope.`);
    const generated = await generateReports(actor, {
      academicYear: year.id,
      grade: GRADE,
      students: students.map((student) => student.id),
      format: 'CLASSIC',
      examTerm: scope.term,
      examId: exam.id,
      resultMode: 'EXAM',
      includePrevious: false,
      themeAssignmentIds: scope.assignmentIds,
      examTitle: scope.name,
    });
    expect(generated.created.length === students.length && generated.skipped.length === 0,
      `${scope.name}: expected draft reports for all Grade 3 students.`);
    reports.push({ name: scope.name, created: generated.created.length, selectedThemes: scope.assignmentIds.length });

    const cards = await loadGradeReportCards(actor, {
      academicYear: year.id,
      grade: GRADE,
      format: 'CLASSIC',
      examTerm: scope.term,
      examId: exam.id,
      resultMode: 'EXAM',
      includePrevious: false,
      themeAssignmentIds: scope.assignmentIds,
      examTitle: scope.name,
      students: students.map((student) => student.id),
    });
    expect(cards.students.length === students.length, `${scope.name}: expected cards for all Grade 3 students.`);
    for (const card of cards.students) {
      expect(card.report?.snapshot?.selectedThemes?.length === scope.assignmentIds.length,
        `${scope.name}: a card did not retain its selected-theme scope.`);
      expect(card.report.snapshot.total.assessedCount > 0, `${scope.name}: a card has no assessed outcomes.`);
    }
  }

  const draftReports = await CasReport.countDocuments({
    school: actor.school, academicYear: year.id, grade: GRADE, status: 'DRAFT',
  });
  const themeRows = await CasThemeExam.countDocuments({
    school: actor.school, academicYear: year.id, grade: GRADE,
  });
  console.log(JSON.stringify({
    grade: GRADE,
    students: students.length,
    subjects: subjects.length,
    themeAssignments: themeRows,
    sheetsSaved,
    marksAdded,
    reports,
    draftReports,
    publishedReports: 0,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Grade 3 demo load failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => connectDB().then(() => import('mongoose')).then(({ default: mongoose }) => mongoose.disconnect()));
