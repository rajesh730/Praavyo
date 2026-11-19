import { GRADE_SCALE, valueOrDash } from './reportText.js';

/**
 * The shared GRADE-SHEET look of every report card: the CAS card
 * (ClassicReport.js) and the Internal Exam card (InternalExamReport.js) are
 * drawn from these same parts, so the two always match (owner, 2026-11-19:
 * "theme must be same"). Each card keeps its own data.
 *
 * Every school or student detail passed in here is live (casBranding); a
 * card's frozen snapshot is only the fallback. Hook-free, like the cards.
 */
export const INK = '#1f4e79';
export const LINE = '#9fb3c8';
export const SOFT = '#eef3f8';

// The remark printed in the Remarks box, chosen by the Average Grade.
const REMARKS = {
  'A+': ['Outstanding result. Keep it up!', 'उत्कृष्ट नतिजा। यसलाई निरन्तरता दिनुहोस्!'],
  A: ['Excellent result. Keep it up.', 'अति राम्रो नतिजा। यसलाई निरन्तरता दिनुहोस्।'],
  'B+': ['Very good result. Go ahead for better performance.', 'धेरै राम्रो नतिजा। अझ राम्रोका लागि अगाडि बढ्नुहोस्।'],
  B: ['Good result. Go ahead for better performance.', 'राम्रो नतिजा। अझ राम्रोका लागि अगाडि बढ्नुहोस्।'],
  'C+': ['Satisfactory. Work harder for better performance.', 'सन्तोषजनक। अझ राम्रोका लागि थप मेहनत गर्नुहोस्।'],
  C: ['Acceptable. More effort is needed.', 'स्वीकार्य। थप प्रयास आवश्यक छ।'],
  D: ['Basic. Needs serious improvement.', 'आधारभूत। धेरै सुधार आवश्यक छ।'],
  NG: ['Not graded. Needs extra support and a re-exam.', 'अवर्गीकृत। थप सहयोग र पुनः परीक्षा आवश्यक छ।'],
};

export function remarkFor(grade, lang = 'en') {
  return REMARKS[grade]?.[lang === 'ne' ? 1 : 0] || '';
}

/** "Grade 1" → "1"; a grade named otherwise ("Nursery", "LKG") prints as it is. */
export function gradeNumber(grade) {
  const value = String(grade || '').trim();
  return value.replace(/^grade\s*/i, '') || value;
}

/**
 * The school, the exam and the student, live from the records:
 * `school` { name, address, logoUrl, reportImageUrl, iemis },
 * `student` { name, grade, roll, section, iemis }.
 */
export function SheetTop({ school, examTitle, student, sheetLabel = 'GRADE - SHEET' }) {
  return (
    <>
      <header className="cas-avoid-break flex items-center gap-4">
        {school.logoUrl ? (
          // A plain <img>, so the downloaded PDF can draw it too.
          // eslint-disable-next-line @next/next/no-img-element
          <span className="block h-16 w-16 shrink-0 overflow-hidden text-[0px]"><img src={school.logoUrl} alt={`${school.name} logo`} className="h-full w-full object-contain" /></span>
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-2xl font-bold text-white" style={{ background: INK }}>
            {school.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-[22px] font-bold leading-tight">{school.name}</h1>
          {school.address && <p className="text-[11.5px]">{school.address}</p>}
        </div>
        {/* Optional, set in Settings (e.g. the national flag); a spacer keeps the name centred. */}
        {school.reportImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <span className="block h-16 w-16 shrink-0 overflow-hidden text-[0px]"><img src={school.reportImageUrl} alt="" className="h-full w-full object-contain" /></span>
        ) : <span className="w-16 shrink-0" aria-hidden="true" />}
      </header>

      <p className="cas-avoid-break mt-2 border py-0.5 text-center text-[14px] font-bold" style={{ borderColor: LINE, background: SOFT }}>
        {examTitle}
      </p>

      <div className="cas-avoid-break mt-1.5 grid grid-cols-2 gap-x-6 border px-3 py-1.5 text-[10.5px]" style={{ borderColor: LINE }}>
        <dl className="space-y-0.5">
          <Detail label="NAME" value={student.name} strong wide />
          <Detail label="SCHOOL IEMIS" value={school.iemis} wide />
          <Detail label="STUDENT IEMIS" value={student.iemis} wide />
        </dl>
        <dl className="space-y-0.5 justify-self-end">
          <Detail label="GRADE" value={gradeNumber(student.grade)} />
          <Detail label="ROLL NO." value={student.roll} />
          {/* Only when the grade has sections configured. */}
          {student.section ? <Detail label="SECTION" value={student.section} /> : null}
        </dl>
      </div>

      <div className="cas-avoid-break my-2 flex justify-center">
        <span className="rounded-full border-2 px-6 py-0.5 text-[13px] font-bold tracking-wide" style={{ borderColor: INK, color: INK }}>
          {sheetLabel}
        </span>
      </div>
    </>
  );
}

/** The grading scale. `ngPoint` is what NG carries: '0.0' on internal exams, '-' for CAS. */
export function GradingScale({ ngPoint = '-' }) {
  return (
    <section>
      <h3 className="mb-0.5 text-center text-[11.5px] font-bold">Grading Scale</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: SOFT }}>
            <ScaleCell head>Marks Range</ScaleCell>
            <ScaleCell head>Grade</ScaleCell>
            <ScaleCell head>Performance</ScaleCell>
            <ScaleCell head>Grade Point</ScaleCell>
          </tr>
        </thead>
        <tbody>
          {GRADE_SCALE.map((row) => (
            <tr key={row.grade}>
              <ScaleCell>{row.range}</ScaleCell>
              <ScaleCell bold>{row.grade}</ScaleCell>
              <ScaleCell>{row.performance}</ScaleCell>
              <ScaleCell>{row.grade === 'NG' ? ngPoint : row.point}</ScaleCell>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** `grow`: fill the space left in its column (beside the grading scale), or just fit the text. */
export function RemarksBox({ remark, className = '', grow = true }) {
  return (
    <section className={`flex flex-col ${grow ? 'flex-1' : ''} ${className}`}>
      <div className={`min-h-[3rem] border p-2 ${grow ? 'flex-1' : ''}`} style={{ borderColor: LINE }}>
        <p className="font-bold">Remarks:-</p>
        <p className="mt-1 italic">{remark}</p>
      </div>
    </section>
  );
}

/** Issue date, then the four signature lines at the foot of the page. */
export function SheetFoot({ issueDate, classTeacher = '', principal = '', note = null }) {
  return (
    <>
      <p className="cas-avoid-break mt-2 text-[11px]"><span className="font-bold">Issue Date:</span> {issueDate || '-'}</p>
      <footer className="cas-avoid-break cas-a4-foot mt-auto pt-7 text-center text-[10.5px]">
        <div className="grid grid-cols-4 gap-6">
          <Signature label="Exam Coordinator" />
          <Signature label="Class Teacher" value={classTeacher} />
          <Signature label="School Stamp" />
          <Signature label="Principal" value={principal} />
        </div>
        {note}
      </footer>
    </>
  );
}

/** The bordered frame every sheet sits in, filling the A4 page. */
export function SheetFrame({ children }) {
  return (
    // cas-a4-fit + cas-a4-foot hold the signatures at the foot of the page.
    <article className="cas-a4 cas-a4-fit bg-white text-[#111]">
      <div className="flex flex-1 flex-col border-2 p-3" style={{ borderColor: INK }}>
        {children}
      </div>
    </article>
  );
}

export function Detail({ label, value, strong = false, wide = false }) {
  return (
    <div className="flex gap-2">
      <dt className={`${wide ? 'w-[6.5rem]' : 'w-[4.5rem]'} shrink-0 font-bold`}>{label}:</dt>
      <dd className={strong ? 'font-bold' : ''}>{valueOrDash(value)}</dd>
    </div>
  );
}

export function Th({ children, left = false }) {
  return <th className={`border px-1 py-1.5 text-[10.5px] font-bold leading-tight ${left ? 'pl-2 text-left' : 'text-center'}`} style={{ borderColor: LINE }}>{children}</th>;
}

/** `side`: a blank filler row, drawn with side borders only, like the printed sheet. */
export function Td({ children, left = false, bold = false, side = false, className = '' }) {
  return (
    <td
      className={`px-1 py-[3px] ${left ? 'pl-2 text-left' : 'text-center'} ${bold ? 'font-bold' : ''} ${side ? 'border-x' : 'border'} ${className}`}
      style={{ borderColor: LINE }}
    >
      {children}
    </td>
  );
}

export function ScaleCell({ children, head = false, bold = false }) {
  const Tag = head ? 'th' : 'td';
  return <Tag className={`border px-1 py-[3px] text-center ${head || bold ? 'font-bold' : ''}`} style={{ borderColor: LINE }}>{children}</Tag>;
}

export function Signature({ label, value = '' }) {
  return (
    <div>
      <p className="h-5 text-[11px] font-semibold leading-5">{value}</p>
      <p className="border-t border-[#111] pt-1">{label}</p>
    </div>
  );
}

/** Blank rows that keep a grade table a steady height (`columns` cells each). */
export function FillerRows({ count, columns }) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    <tr key={`filler-${index}`} aria-hidden="true">
      {Array.from({ length: columns }, (__, cell) => <Td key={cell} side>{cell === 0 ? ' ' : null}</Td>)}
    </tr>
  ));
}
