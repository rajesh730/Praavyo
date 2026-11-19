import { ECA_FIELDS } from '@pravyo/core/casSupplementary';
import { picker, issueDateOf, examTitleOf, academicYearOf, valueOrDash } from './reportText.js';
import {
  FillerRows, GradingScale, INK, LINE, RemarksBox, SheetFoot, SheetFrame, SheetTop, SOFT, Td, Th, remarkFor,
} from './gradeSheet.js';

/**
 * The internal (school) exam report card: a GRADE-SHEET, laid out like the
 * schools' own printed sheet (owner's sample, 2026-11-19). The CAS card is
 * drawn from the same parts (gradeSheet.js), so the two always match.
 *
 * Grades only, never marks: for each subject its full marks, credit hours,
 * TH grade, INT grade, the final (obtained) grade and its grade point; then
 * the total full marks, the Average Grade (AG) and the GPA. Attendance, extra
 * activities, the grading scale, a remark, the issue date and four
 * signatures follow. Prints on ONE A4 page (checked at 10 subjects and 12
 * activities).
 *
 * Like the CAS layouts it has no hooks and no 'use client', so the school's
 * screen and the guardian's portal draw the identical card.
 */
// Blank rows keep the grade table a steady height.
const MIN_ROWS = 7;

export default function InternalExamReport({ report, lang = 'en' }) {
  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const pick = picker(lang);
  const subjects = s.subjects || [];
  // School and student details are live (casBranding), so a change in the
  // records shows on every card; the snapshot copy is only a fallback.
  const live = report.branding || {};
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
  const attendance = s.attendance || {};
  // The school's own activities, each "obtained/full" (e.g. 9/10). Cards
  // published before activities had full marks show their old values.
  const activityRows = Array.isArray(s.activities)
    ? s.activities.map((line) => ({ id: line.id, name: line.name, value: activityText(line) }))
    : ECA_FIELDS.map((field) => ({ id: field.key, name: field.label, value: s.extraActivities?.[field.key] || '-' }));
  const gpa = typeof s.gpa === 'number' ? s.gpa.toFixed(2) : valueOrDash(s.gpa);
  const title = examTitleOf(s);
  const year = academicYearOf(s);

  return (
    <SheetFrame>
      <SheetTop
        school={school}
        examTitle={`${title}${year && !String(title).includes(year) ? ` ${year}` : ''}`}
        student={student}
        sheetLabel={lang === 'ne' ? 'ग्रेड - सिट' : 'GRADE - SHEET'}
      />

      {/* Grades */}
      <table className="w-full table-fixed border-collapse text-[11px]">
        <colgroup>
          <col className="w-[6%]" />
          <col className="w-[30%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr style={{ background: SOFT }}>
            <Th>S/N</Th>
            <Th left>Subjects</Th>
            <Th>Full Marks</Th>
            <Th>Credit Hour</Th>
            <Th>TH Grade</Th>
            <Th>INT. Grade</Th>
            <Th>Obtained Grade</Th>
            <Th>Grade Point</Th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <tr key={subject.id || index}>
              <Td>{index + 1}</Td>
              <Td left>{pick(subject.titleEn, subject.titleNe) || '-'}</Td>
              <Td>{valueOrDash(subject.fullMarks)}</Td>
              <Td>{valueOrDash(subject.creditHours)}</Td>
              <Td>{partGrade(subject, subject.theory)}</Td>
              <Td>{partGrade(subject, subject.internal)}</Td>
              <Td bold>{subject.absent ? 'ABS' : valueOrDash(subject.grade)}</Td>
              <Td>{subject.gradePoint == null ? '-' : subject.gradePoint.toFixed(1)}</Td>
            </tr>
          ))}
          <FillerRows count={MIN_ROWS - subjects.length} columns={8} />
          <tr className="font-bold" style={{ background: SOFT }}>
            <Td />
            <Td />
            <Td>{valueOrDash(s.fullMarks)}</Td>
            <td colSpan={4} className="border px-2 py-1.5 text-right" style={{ borderColor: LINE }}>
              Average Grade (AG): <span className="ml-1 text-[13px]" style={{ color: INK }}>{valueOrDash(s.overallGrade)}</span>
            </td>
            <Td><span className="text-[13px]" style={{ color: INK }}>{gpa}</span></Td>
          </tr>
        </tbody>
      </table>

      {/* Attendance + activities | grading scale + remarks */}
      <div className="cas-avoid-break mt-3 grid grid-cols-[1.25fr_1fr] gap-3 text-[10px]">
        <div className="space-y-2">
          <section>
            <h3 className="mb-0.5 text-center text-[11.5px] font-bold">Attendance</h3>
            <table className="w-full border-collapse">
              <tbody>
                <LabelRow label="Working Days" value={valueOrDash(attendance.workingDays)} />
                <LabelRow label="Present Days" value={valueOrDash(attendance.presentDays)} />
                <LabelRow label="Absent Days" value={valueOrDash(attendance.absentDays)} />
              </tbody>
            </table>
          </section>
          {activityRows.length > 0 && (
            <section>
              <h3 className="mb-0.5 text-center text-[11.5px] font-bold">Extra Activities</h3>
              {/* Two activities per row, so even a long list stays on the one page. */}
              <table className="w-full table-fixed border-collapse">
                <colgroup><col className="w-[34%]" /><col className="w-[16%]" /><col className="w-[34%]" /><col className="w-[16%]" /></colgroup>
                <tbody>
                  {pairsOf(activityRows).map((pair) => (
                    <tr key={pair[0].id}>
                      {pair.map((row) => <LabelCells key={row.id} label={row.name} value={row.value} />)}
                      {pair.length === 1 && <><td className="border" style={{ borderColor: LINE }} /><td className="border" style={{ borderColor: LINE }} /></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {/* On internal exams NG carries grade point 0.0. */}
          <GradingScale ngPoint="0.0" />
          <RemarksBox remark={remarkFor(s.overallGrade, lang)} />
        </div>
      </div>

      <SheetFoot
        issueDate={issueDateOf(report)}
        classTeacher={live.classTeachers?.[s.student?.grade] || ''}
        principal={live.principalName || ''}
      />
    </SheetFrame>
  );
}

/** "9/10" for a mark, the old text as it was ("A"), or "-" when nothing is recorded. */
function activityText(line) {
  if (typeof line.obtained === 'number') return `${line.obtained}/${line.fullMarks}`;
  return line.obtained ? String(line.obtained) : '-';
}

/** A part's grade (TH or INT): ABS when absent, '-' when the subject has no such part. */
function partGrade(subject, part) {
  if (!part) return '-';
  if (subject.absent) return 'ABS';
  return valueOrDash(part.grade);
}

function LabelRow({ label, value }) {
  return (
    <tr>
      <td className="border px-2 py-[2px] text-left" style={{ borderColor: LINE }}>{label}</td>
      <td className="w-[28%] border px-1 py-[2px] text-center font-semibold uppercase" style={{ borderColor: LINE }}>{value}</td>
    </tr>
  );
}

/** A label and its value as two cells, for the two-per-row activities table. */
function LabelCells({ label, value }) {
  return (
    <>
      <td className="truncate border px-1.5 py-[2px] text-left" style={{ borderColor: LINE }} title={label}>{label}</td>
      <td className="border px-1 py-[2px] text-center font-semibold" style={{ borderColor: LINE }}>{value}</td>
    </>
  );
}

function pairsOf(list) {
  const rows = [];
  for (let index = 0; index < list.length; index += 2) rows.push(list.slice(index, index + 2));
  return rows;
}
