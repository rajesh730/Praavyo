import { ECA_FIELDS, hasAttendance, hasExtraActivities } from '@pravyo/core/casSupplementary';
import { isPrimaryLevel } from '@pravyo/core/gradeLevels';
import {
  GRADE_SCALE,
  picker,
  issueDateOf,
  examTitleOf,
  valueOrDash,
} from './reportText.js';

/**
 * The school's own marksheet, used by Format 1 — Classic.
 *
 * Laid out from the marksheet the school supplied: bordered grade table,
 * attendance and extra activities down the left, the grading key and remarks
 * down the right, issue date, then four signature lines.
 *
 * Deliberately free of hooks and of 'use client' so the SAME component renders
 * on the school's A4 print route (a server component) and inside the guardian's
 * portal (a client tree). Two copies of this layout previously drifted apart,
 * which is how a published report could show one thing to a school and another
 * to the parent reading it.
 */

// The school's sheet keeps a fixed table height so the lower half always lands
// in the same place, whether a grade carries nine subjects or five. Eight rows
// is what still leaves room for the whole sheet on one A4 page.
const MIN_SUBJECT_ROWS = 8;

export default function ModernReport({ report, lang = 'en' }) {
  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const pick = picker(lang);
  const subjects = s.subjects || [];
  const attendance = s.attendance || {};
  const extraActivities = s.extraActivities || {};
  const issueDate = issueDateOf(report);
  // Sections the school has not filled in are left off the card entirely.
  const showAttendance = hasAttendance(attendance);
  const showActivities = hasExtraActivities(extraActivities);
  const showSide = showAttendance || showActivities;
  const schoolIemisNumber = s.school?.iemisNumber?.trim();
  const { logoUrl, reportImageUrl } = report.branding || {};
  const section = s.student?.section?.trim();
  const remark =
    pick(s.overallRemarkEn, s.overallRemarkNe) ||
    'Good result; Go ahead for better performance.';
  const fillerRows = Math.max(0, MIN_SUBJECT_ROWS - subjects.length);
  // Primary grades are assessed through continuous assessment, not separate
  // theory and internal examinations. Keep those empty columns for Grades 6+
  // only, where a school may use them later.
  const showTheoryAndInternalGrades = !isPrimaryGrade(s.student?.grade);
  const subjectColumnCount = showTheoryAndInternalGrades ? 8 : 6;

  return (
    <article className="cas-a4 cas-a4-fit cas-marksheet rounded-lg border-2 border-[#111] p-6 text-[#111]">
      <header className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-4">
        {logoUrl ? (
          // A plain <img>, so the downloaded PDF can draw it too.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${s.school?.name || 'School'} logo`} className="h-14 w-14 object-contain" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-[#111] text-lg font-bold">
            {(s.school?.name || 'S').slice(0, 1)}
          </div>
        )}
        <div className="text-center">
          <h1 className="text-2xl font-bold leading-tight">{s.school?.name || 'School'}</h1>
        </div>
        {/* Optional, set in Settings. Without it the space stays empty so the
            school name remains centred. */}
        {reportImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reportImageUrl} alt="" className="h-14 w-14 object-contain" />
        ) : <span aria-hidden="true" />}
      </header>

      {/* The school titles this bar with the exam itself ("First Terminal
          Examination 2083"), so print the year label as-is rather than
          appending anything to it. */}
      <div className="cas-marksheet-exam-title mx-auto mt-4 w-[88%] rounded border border-[#111] bg-[#eef0ea] py-1 text-center text-sm font-bold">
        {examTitleOf(s) || 'Academic Year'}
      </div>
      {s.includePrevious && (
        <p className="mt-1 text-center text-[10px] font-semibold">
          {lang === 'ne' ? 'अघिल्ला परीक्षाका मूल्याङ्कनसमेत समावेश छन्' : 'Includes assessments from previous exams'}
        </p>
      )}

      <div className="cas-marksheet-identity mt-3 grid grid-cols-2 gap-x-8 gap-y-1 rounded border border-[#111] px-3 py-2 text-[11px]">
        {schoolIemisNumber ? <Detail label="IEMIS NO." value={schoolIemisNumber} /> : null}
        {section ? <Detail label="SECTION" value={section} /> : null}
        <Detail label="NAME" value={s.student?.name || '-'} />
        <Detail label="ROLL NO" value={s.student?.rollNumber || '-'} />
        <Detail label="CLASS" value={s.student?.grade || '-'} />
      </div>

      <h2 className="cas-marksheet-grade-title mx-auto my-3 w-fit rounded-xl border border-[#111] bg-[#eef0ea] px-10 py-1 text-base font-bold tracking-wide">
        GRADE - SHEET
      </h2>

      <table className="cas-marksheet-grade-table w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col className="w-[7%]" />
          <col className={showTheoryAndInternalGrades ? 'w-[29%]' : 'w-[42%]'} />
          <col className={showTheoryAndInternalGrades ? 'w-[10%]' : 'w-[12%]'} />
          <col className={showTheoryAndInternalGrades ? 'w-[10%]' : 'w-[12%]'} />
          {showTheoryAndInternalGrades && <>
            <col className="w-[11%]" />
            <col className="w-[11%]" />
          </>}
          <col className={showTheoryAndInternalGrades ? 'w-[12%]' : 'w-[16%]'} />
          <col className={showTheoryAndInternalGrades ? 'w-[10%]' : 'w-[11%]'} />
        </colgroup>
        <thead>
          <tr>
            <Th>S/N</Th>
            <Th>Subjects</Th>
            <Th>Full<br />Marks</Th>
            <Th>Credit<br />Hour</Th>
            {showTheoryAndInternalGrades && <>
              <Th>TH<br />Grade</Th>
              <Th>INT.<br />Grade</Th>
            </>}
            <Th>Obtained<br />Grade</Th>
            <Th>Grade<br />Point</Th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <tr key={subject.subjectCode || subject.titleEn || index}>
              <Td>{index + 1}</Td>
              <Td className="pl-2 text-left">
                {pick(subject.titleEn, subject.titleNe) || '-'}
              </Td>
              <Td>100</Td>
              <Td>{subject.creditHours ?? '-'}</Td>
              {showTheoryAndInternalGrades && <>
                <Td>-</Td>
                <Td>-</Td>
              </>}
              <Td>{subject.grade || '-'}</Td>
              <Td>{subject.gradePoint ?? '-'}</Td>
            </tr>
          ))}
          {Array.from({ length: fillerRows }, (_, i) => (
            <tr key={`filler-${i}`}>
              {Array.from({ length: subjectColumnCount }, (__, c) => <Td key={c}>&nbsp;</Td>)}
            </tr>
          ))}
          <tr className="font-bold">
            <Td />
            <Td />
            <Td>{subjects.length ? subjects.length * 100 : '-'}</Td>
            <Td colSpan={showTheoryAndInternalGrades ? 3 : 1} className="pr-2 text-right">Average Grade(AG):</Td>
            <Td>{s.overallGrade || '-'}</Td>
            <Td>{s.gpa ?? '-'}</Td>
          </tr>
        </tbody>
      </table>

      <div className={`cas-marksheet-lower mt-3 grid gap-3 ${showSide ? 'grid-cols-[0.86fr_1.4fr]' : 'grid-cols-1'}`}>
        {showSide && (
          <div>
            {showAttendance && (
              <MiniTable title="Attendance">
                <Row label="Working Days" value={valueOrDash(attendance.workingDays)} />
                <Row label="Present Days" value={valueOrDash(attendance.presentDays)} />
                <Row label="Absent Days" value={valueOrDash(attendance.absentDays)} />
              </MiniTable>
            )}

            {showActivities && (
              <MiniTable title="Extra Activities" className={showAttendance ? 'mt-2' : ''}>
                {ECA_FIELDS.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={extraActivities[field.key] || '-'}
                  />
                ))}
              </MiniTable>
            )}
          </div>
        )}

        <div>
          <h3 className="mb-1 text-center text-xs font-bold">Grading Scale</h3>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <ScaleTh>Marks Range</ScaleTh>
                <ScaleTh>Grade</ScaleTh>
                <ScaleTh>Performance</ScaleTh>
                <ScaleTh>Grade Point</ScaleTh>
              </tr>
            </thead>
            <tbody>
              {GRADE_SCALE.map((row) => (
                <tr key={row.grade}>
                  <ScaleTd>{row.range}</ScaleTd>
                  <ScaleTd>{row.grade}</ScaleTd>
                  <ScaleTd>{row.performance}</ScaleTd>
                  <ScaleTd>{row.point}</ScaleTd>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="cas-marksheet-remarks mt-2 min-h-[3.5rem] rounded border border-[#111] p-2 text-[11px]">
            <h3 className="mb-1 font-bold">Remarks:-</h3>
            <p className="italic text-[#1f5136]">{remark}</p>
          </section>
        </div>
      </div>

      <footer className="cas-a4-foot mt-6 grid grid-cols-4 gap-6 text-center text-[10px]">
        <SignatureLine value={`Issue Date: ${issueDate || '-'}`} label="Exam Coordinator" />
        <SignatureLine label="Class Teacher" />
        <SignatureLine label="School Stamp" />
        <SignatureLine label="Principal" />
      </footer>
    </article>
  );
}

// Nursery, LKG, UKG and Grades 1-5 share the primary card format.
function isPrimaryGrade(grade) {
  return isPrimaryLevel(grade);
}

function Detail({ label, value }) {
  return (
    <div>
      <strong>{label} :</strong> {value}
    </div>
  );
}

function SignatureLine({ value = '', label }) {
  return (
    <div>
      <p className="h-5 border-b border-[#111] text-left text-[11px] font-semibold leading-5">{value}</p>
      <p className="pt-1">{label}</p>
    </div>
  );
}

function Th({ children }) {
  return (
    <th className="border border-[#111] bg-[#eef0ea] px-1 py-1 text-center text-[10px] font-bold leading-tight">
      {children}
    </th>
  );
}

function Td({ children, colSpan, className = '' }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-[#111] px-1 py-[3px] text-center align-middle ${className}`}
    >
      {children}
    </td>
  );
}

function ScaleTh({ children }) {
  return (
    <th className="border border-[#111] bg-[#eef0ea] px-1 py-[3px] text-center font-bold">
      {children}
    </th>
  );
}

function ScaleTd({ children }) {
  return <td className="border border-[#111] px-1 py-[3px] text-center">{children}</td>;
}

function MiniTable({ title, className = '', children }) {
  return (
    <div className={className}>
      <h3 className="mb-1 text-center text-xs font-bold">{title}</h3>
      <table className="w-full border-collapse text-[11px]">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <tr>
      <td className="border border-[#111] px-2 py-[3px]">{label}</td>
      <td className="w-[28%] border border-[#111] px-2 py-[3px] text-center font-semibold">
        {value}
      </td>
    </tr>
  );
}
