import { stringsFor, picker, issueDateOf, academicYearOf, examTitleOf, valueOrDash } from './reportText.js';
import {
  FillerRows, GradingScale, INK, LINE, RemarksBox, SheetFoot, SheetFrame, SheetTop, SOFT, Td, Th, remarkFor,
} from './gradeSheet.js';

/**
 * The CAS (continuous assessment) report card, used for every CAS result.
 *
 * Drawn as the same GRADE-SHEET as the Internal Exam card (gradeSheet.js,
 * owner 2026-11-19: "theme must be same") but with CAS's own figures: for
 * each subject its credit hours, grade point, grade and remark, then the
 * total credit hours, GPA and Average Grade. Outcomes assessed and
 * achievement % are not printed (owner, 2026-11-20); they stay in the
 * snapshot and on the school's screens.
 *
 * School and student details are live (casBranding); the snapshot copy is
 * only a fallback. Hook-free, so the school's print route and the guardian's
 * portal draw the identical card.
 */
const MIN_ROWS = 7;

export default function ClassicReport({ report, lang = 'en' }) {
  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const t = stringsFor(lang);
  const pick = picker(lang);
  const live = report.branding || {};
  const subjects = s.subjects || [];
  const year = academicYearOf(s);
  const title = examTitleOf(s) || t.reportTitle;
  const school = {
    name: live.schoolName || s.school?.name || 'School',
    address: live.schoolAddress || s.school?.address || '',
    logoUrl: live.logoUrl,
    reportImageUrl: live.reportImageUrl,
    iemis: live.schoolIemis || s.school?.iemisNumber,
  };
  const student = {
    name: live.studentName || s.student?.name,
    grade: s.student?.grade,
    roll: live.studentRoll ?? s.student?.rollNumber,
    section: 'studentSection' in live ? live.studentSection : s.student?.section,
    iemis: live.studentIemis ?? s.student?.iemisNumber,
  };
  const gpa = typeof s.gpa === 'number' ? s.gpa.toFixed(2) : valueOrDash(s.gpa);

  return (
    <SheetFrame>
      <SheetTop
        school={school}
        examTitle={`${title}${year && !String(title).includes(year) ? ` ${year}` : ''}`}
        student={student}
        sheetLabel={lang === 'ne' ? 'ग्रेड - सिट' : 'GRADE - SHEET'}
      />
      {s.includePrevious && (
        <p className="-mt-1 mb-1.5 text-center text-[10px] font-semibold text-[#555]">
          {lang === 'ne' ? 'अघिल्ला परीक्षाका मूल्याङ्कनसमेत समावेश छन्' : 'Includes assessments from previous exams'}
        </p>
      )}

      {/* Grades */}
      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[34%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[28%]" />
        </colgroup>
        <thead>
          <tr style={{ background: SOFT }}>
            <Th>S/N</Th>
            <Th left>Subjects</Th>
            <Th>Credit Hour</Th>
            <Th>Grade Point</Th>
            <Th>Grade</Th>
            <Th left>Remarks</Th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <tr key={subject.subjectCode || subject.id || index}>
              <Td>{index + 1}</Td>
              <Td left>{pick(subject.titleEn, subject.titleNe) || '-'}</Td>
              <Td>{valueOrDash(subject.creditHours)}</Td>
              <Td>{subject.gradePoint == null ? '-' : Number(subject.gradePoint).toFixed(1)}</Td>
              <Td bold>{valueOrDash(subject.grade)}</Td>
              <Td left className="truncate">{pick(subject.remarkEn, subject.remarkNe) || '-'}</Td>
            </tr>
          ))}
          <FillerRows count={MIN_ROWS - subjects.length} columns={6} />
          <tr className="font-bold" style={{ background: SOFT }}>
            <Td />
            <Td left>{t.overall}</Td>
            <Td>{valueOrDash(s.totalCreditHours)}</Td>
            <td colSpan={3} className="border px-2 py-1.5 text-right" style={{ borderColor: LINE }}>
              GPA: <span className="mr-3 text-[13px]" style={{ color: INK }}>{gpa}</span>
              Average Grade (AG): <span className="ml-1 text-[13px]" style={{ color: INK }}>{valueOrDash(s.overallGrade)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Remarks | grading scale (the scale sits where it does on the Internal Exam card) */}
      <div className="cas-avoid-break mt-3 grid grid-cols-[1.25fr_1fr] gap-3 text-[10px]">
        <div className="flex flex-col pt-[1.1rem]">
          <RemarksBox remark={remarkFor(s.overallGrade, lang) || pick(s.overallRemarkEn, s.overallRemarkNe)} />
        </div>
        <GradingScale ngPoint="-" />
      </div>

      <SheetFoot
        issueDate={issueDateOf(report)}
        classTeacher={live.classTeachers?.[s.student?.grade] || ''}
        principal={live.principalName || s.school?.principalName || ''}
        note={report.status && report.status !== 'PUBLISHED' ? (
          // Only an unpublished preview is labelled; a published card stays clean.
          <p className="mt-3 border-t pt-1 text-left text-[10px] text-[#5f6b7a]" style={{ borderColor: LINE }}>{t.draftWarning}</p>
        ) : null}
      />
    </SheetFrame>
  );
}
