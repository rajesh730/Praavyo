import { gradeFor } from '@pravyo/core/casGrading';
import { ECA_FIELDS, hasAttendance, hasExtraActivities } from '@pravyo/core/casSupplementary';
import { GRADE_SCALE, picker, issueDateOf, examTitleOf, valueOrDash } from './reportText.js';

/**
 * The internal (school) exam report card — the Modern format.
 *
 * Marks-based: each subject's full marks, pass marks, marks obtained, grade and
 * grade point, then the total, percentage, GPA and pass/fail. CAS results keep
 * the Classic grade sheet; this card exists only for internal exams.
 *
 * Like the CAS layouts it has no hooks and no 'use client', so the school's
 * screen and the guardian's portal draw the identical card.
 */
const BRAND = '#2b59c3';

export default function InternalExamReport({ report, lang = 'en' }) {
  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const pick = picker(lang);
  const subjects = s.subjects || [];
  const { logoUrl, reportImageUrl, principalName, classTeachers, schoolIemis, studentIemis } = report.branding || {};
  const issueDate = issueDateOf(report);
  // The remark follows the result: the grade band's own words when passed,
  // otherwise the subjects that were not passed.
  const notPassed = subjects.filter((line) => line.entered && !line.passed).map((line) => pick(line.titleEn, line.titleNe));
  const remark = s.passed
    ? (lang === 'ne' ? gradeFor(s.percent)?.remarkNe : gradeFor(s.percent)?.remarkEn) || '-'
    : notPassed.length
      ? `${lang === 'ne' ? 'सुधार आवश्यक' : 'Needs improvement in'}: ${notPassed.join(', ')}`
      : '-';
  // Recorded on Internal Exam → Attendance & Activities. A section the school
  // has not filled in is left off the card (cards published before this
  // existed have neither).
  const attendance = s.attendance || {};
  const extraActivities = s.extraActivities || {};
  const showAttendance = hasAttendance(attendance);
  const showActivities = hasExtraActivities(extraActivities);
  const summary = [
    ['Total marks', `${valueOrDash(s.obtained)} / ${valueOrDash(s.fullMarks)}`],
    ['Percentage', s.percent == null ? '-' : `${s.percent}%`],
    ['GPA', valueOrDash(s.gpa)],
    ['Result', s.passed ? 'PASS' : 'NOT PASSED'],
  ];

  return (
    <article className="cas-a4 cas-a4-fit overflow-hidden rounded-lg border border-[#c9d3ea] bg-white text-[#111]">
      <header className="flex items-center gap-4 px-6 py-4 text-white" style={{ background: BRAND }}>
        {logoUrl ? (
          // A plain <img>, so the downloaded PDF can draw it too.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${s.school?.name || 'School'} logo`} className="h-14 w-14 rounded-full bg-white object-contain p-1" />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white text-xl font-bold" style={{ color: BRAND }}>
            {(s.school?.name || 'S').slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-xl font-bold leading-tight">{s.school?.name || 'School'}</h1>
          {s.school?.address && <p className="text-[11px] opacity-90">{s.school.address}</p>}
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">Progress Report</p>
        </div>
        {reportImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reportImageUrl} alt="" className="h-14 w-14 rounded bg-white object-contain p-1" />
        ) : <span className="w-14" aria-hidden="true" />}
      </header>

      <div className="px-6 py-4">
        <p className="text-center text-base font-bold" style={{ color: BRAND }}>{examTitleOf(s)}</p>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-[#f2f5fc] px-4 py-2 text-[11px] sm:grid-cols-3">
          <Detail label="Name" value={s.student?.name} />
          <Detail label="Class" value={s.student?.grade} />
          <Detail label="Roll No." value={s.student?.rollNumber} />
          {s.student?.section ? <Detail label="Section" value={s.student.section} /> : null}
          {/* Both government IEMIS numbers, live from the records. */}
          <Detail label="Student IEMIS No." value={studentIemis || s.student?.iemisNumber} />
          <Detail label="School IEMIS No." value={schoolIemis || s.school?.iemisNumber} />
          <Detail label="Academic Year" value={s.academicYear?.label} />
        </dl>

        <table className="mt-4 w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[33%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead>
            <tr className="text-white" style={{ background: BRAND }}>
              <Th>S.N.</Th>
              <Th left>Subject</Th>
              <Th>Full Marks</Th>
              <Th>Pass Marks</Th>
              <Th>Obtained Marks</Th>
              <Th>Grade</Th>
              <Th>Grade Point</Th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject, index) => (
              <tr key={subject.id || index} className={index % 2 ? 'bg-[#f7f9fd]' : ''}>
                <Td>{index + 1}</Td>
                <Td left>{pick(subject.titleEn, subject.titleNe) || '-'}</Td>
                <Td>{subject.fullMarks}</Td>
                <Td>{subject.passMarks}</Td>
                <Td className={subject.entered && !subject.passed ? 'font-bold text-[#b42318]' : ''}>
                  {subject.absent ? 'Absent' : valueOrDash(subject.obtained)}
                </Td>
                <Td>{valueOrDash(subject.grade)}</Td>
                <Td>{subject.gradePoint == null ? '-' : subject.gradePoint.toFixed(1)}</Td>
              </tr>
            ))}
            <tr className="font-bold" style={{ background: '#e7edf9' }}>
              <Td />
              <Td left>Total</Td>
              <Td>{valueOrDash(s.fullMarks)}</Td>
              <Td />
              <Td>{valueOrDash(s.obtained)}</Td>
              <Td>{valueOrDash(s.overallGrade)}</Td>
              <Td>{valueOrDash(s.gpa)}</Td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-md border border-[#c9d3ea] px-2 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-[#555]">{label}</p>
              <p
                className="mt-0.5 text-sm font-bold"
                style={{ color: label === 'Result' ? (s.passed ? '#1f7a3f' : '#b42318') : BRAND }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        {(showAttendance || showActivities) && (
          <div className={`mt-4 grid gap-4 ${showAttendance && showActivities ? 'grid-cols-[1fr_2.2fr]' : 'grid-cols-1'}`}>
            {showAttendance && (
              <div>
                <h3 className="mb-1 text-xs font-bold" style={{ color: BRAND }}>Attendance</h3>
                <table className="w-full border-collapse text-[10px]">
                  <tbody>
                    <LabelRow label="Working Days" value={valueOrDash(attendance.workingDays)} />
                    <LabelRow label="Present Days" value={valueOrDash(attendance.presentDays)} />
                    <LabelRow label="Absent Days" value={valueOrDash(attendance.absentDays)} />
                  </tbody>
                </table>
              </div>
            )}
            {showActivities && (
              <div>
                <h3 className="mb-1 text-xs font-bold" style={{ color: BRAND }}>Extra Activities</h3>
                {/* Two label/grade pairs per row keeps all eight within four lines. */}
                <table className="w-full border-collapse text-[10px]">
                  <tbody>
                    {pairs(ECA_FIELDS).map((pair) => (
                      <tr key={pair[0].key}>
                        {pair.map((field) => (
                          <LabelCells key={field.key} label={field.label} value={extraActivities[field.key] || '-'} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-[1.3fr_1fr] gap-4">
          <div>
            <h3 className="mb-1 text-xs font-bold" style={{ color: BRAND }}>Grading Scale</h3>
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-[#eef2fb]">
                  <ScaleCell head>Percentage</ScaleCell>
                  <ScaleCell head>Grade</ScaleCell>
                  <ScaleCell head>Description</ScaleCell>
                  <ScaleCell head>Grade Point</ScaleCell>
                </tr>
              </thead>
              <tbody>
                {GRADE_SCALE.map((row) => (
                  <tr key={row.grade}>
                    <ScaleCell>{row.range}</ScaleCell>
                    <ScaleCell>{row.grade}</ScaleCell>
                    <ScaleCell>{row.performance}</ScaleCell>
                    <ScaleCell>{row.point}</ScaleCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px]">
            <h3 className="mb-1 text-xs font-bold" style={{ color: BRAND }}>Remarks</h3>
            <div className="min-h-[4rem] rounded-md border border-[#c9d3ea] p-2 italic">
              {remark}
            </div>
            <p className="mt-2 text-[10px] text-[#555]">
              Pass marks are {s.passPercent ?? 35}% of each subject&apos;s full marks.
            </p>
          </div>
        </div>

        <footer className="cas-a4-foot mt-8 grid grid-cols-3 gap-8 text-center text-[10px]">
          <Signature value={classTeachers?.[s.student?.grade] || ''} label="Class Teacher" />
          <Signature value={principalName || ''} label="Principal" />
          <Signature value={issueDate} label="Issue Date" />
        </footer>
      </div>
    </article>
  );
}

function Detail({ label, value }) {
  return (
    <div className="flex gap-1">
      <dt className="text-[#555]">{label}:</dt>
      <dd className="font-semibold">{valueOrDash(value)}</dd>
    </div>
  );
}

function Th({ children, left = false }) {
  return <th className={`border border-[#c9d3ea] px-1 py-1.5 text-[10px] font-bold leading-tight ${left ? 'pl-2 text-left' : 'text-center'}`}>{children}</th>;
}

function Td({ children, left = false, className = '' }) {
  return <td className={`border border-[#c9d3ea] px-1 py-1 ${left ? 'pl-2 text-left' : 'text-center'} ${className}`}>{children}</td>;
}

function pairs(list) {
  const rows = [];
  for (let index = 0; index < list.length; index += 2) rows.push(list.slice(index, index + 2));
  return rows;
}

function LabelCells({ label, value }) {
  return (
    <>
      <td className="border border-[#c9d3ea] bg-[#f7f9fd] px-2 py-[3px] text-left">{label}</td>
      <td className="w-[14%] border border-[#c9d3ea] px-1 py-[3px] text-center font-semibold uppercase">{value}</td>
    </>
  );
}

function LabelRow({ label, value }) {
  return <tr><LabelCells label={label} value={value} /></tr>;
}

function ScaleCell({ children, head = false }) {
  const Tag = head ? 'th' : 'td';
  return <Tag className={`border border-[#c9d3ea] px-1 py-[3px] text-center ${head ? 'font-bold' : ''}`}>{children}</Tag>;
}

function Signature({ value = '', label }) {
  return (
    <div>
      <p className="h-5 border-b border-[#111] text-center text-[11px] font-semibold leading-5">{value}</p>
      <p className="pt-1">{label}</p>
    </div>
  );
}
