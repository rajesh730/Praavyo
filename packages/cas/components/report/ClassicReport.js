import { stringsFor, picker, issueDateOf, academicYearOf, examTitleOf } from './reportText.js';

/**
 * The clean continuous-assessment sheet — the Classic format, used for every
 * CAS result.
 *
 * Shows what the letter grade is built FROM — outcomes assessed, achievement
 * and coverage alongside the grade point — rather than the letter alone. A
 * guardian asking "how was this worked out?" can read the answer off the page.
 *
 * Hook-free, like its Modern counterpart, so one component serves both the
 * school's print route and the guardian's portal.
 */
export default function ClassicReport({ report, lang = 'en' }) {
  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const t = stringsFor(lang);
  const pick = picker(lang);
  const { logoUrl, reportImageUrl, principalName, classTeachers } = report.branding || {};

  return (
    // cas-a4-fit + cas-a4-foot hold the signatures at the foot of the page.
    <article className="cas-a4 cas-a4-fit">
      <header className="cas-avoid-break flex items-start gap-4 border-b-2 border-[#1f4e79] pb-4">
        {logoUrl ? (
          // A plain <img>, so the downloaded PDF can draw it too.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={`${s.school?.name || 'School'} logo`} className="h-16 w-16 shrink-0 object-contain" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#1f4e79] text-2xl font-bold text-white">
            {(s.school?.name || 'S').slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{s.school?.name}</h1>
          {s.school?.schoolCode && (
            <p className="text-xs">
              {t.schoolCode}: {s.school.schoolCode}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="font-bold">{t.academicYear}</p>
          <p>{academicYearOf(s)}</p>
        </div>
        {/* Optional, set in Settings; left off when the school has none. */}
        {reportImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reportImageUrl} alt="" className="h-16 w-16 shrink-0 object-contain" />
        ) : null}
      </header>

      <div className="cas-avoid-break my-5 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide">{examTitleOf(s) || t.reportTitle}</h2>
        {s.includePrevious && (
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {lang === 'ne' ? 'अघिल्ला परीक्षाका मूल्याङ्कनसमेत समावेश छन्' : 'Includes assessments from previous exams'}
          </p>
        )}
      </div>

      <dl className="cas-avoid-break mb-5 grid grid-cols-4 gap-3 border-y border-[#dfe5eb] py-3 text-sm">
        <Item label={t.student} value={s.student?.name} />
        <Item label={t.grade} value={s.student?.grade} />
        <Item label={t.roll} value={s.student?.rollNumber || '—'} />
        {s.school?.iemisNumber ? <Item label="School IEMIS No." value={s.school.iemisNumber} /> : null}
        {s.student?.section ? <Item label="Section" value={s.student.section} /> : null}
      </dl>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#f2f6f9]">
            <Th>{t.subject}</Th>
            <Th className="text-center">{t.creditHour}</Th>
            <Th className="text-center">{t.assessed}</Th>
            <Th className="text-center">{t.achievement}</Th>
            <Th className="text-center">{t.gradePoint}</Th>
            <Th className="text-center">{t.grade}</Th>
            <Th>{t.remarks}</Th>
          </tr>
        </thead>
        <tbody>
          {(s.subjects || []).map((subject) => (
            <tr key={subject.subjectCode}>
              <Td>{pick(subject.titleEn, subject.titleNe)}</Td>
              <Td className="text-center">{subject.creditHours ?? '—'}</Td>
              <Td className="text-center">
                {subject.assessedCount} / {subject.outcomeCount}
              </Td>
              <Td className="text-center font-semibold">
                {subject.achievement == null ? t.notAssessed : `${subject.achievement}%`}
              </Td>
              <Td className="text-center">{subject.gradePoint ?? '—'}</Td>
              <Td className="text-center font-bold">{subject.grade || '—'}</Td>
              <Td>{pick(subject.remarkEn, subject.remarkNe) || '—'}</Td>
            </tr>
          ))}
          <tr className="bg-[#f2f6f9] font-bold">
            <Td>{t.overall}</Td>
            <Td className="text-center">{s.totalCreditHours || '—'}</Td>
            <Td className="text-center">
              {s.total?.assessedCount} / {s.total?.outcomeCount}
            </Td>
            <Td className="text-center">
              {s.total?.achievement == null ? t.notAssessed : `${s.total.achievement}%`}
            </Td>
            <Td className="text-center">{s.gpa ?? '—'}</Td>
            <Td className="text-center">{s.overallGrade || '—'}</Td>
            <Td>{pick(s.overallRemarkEn, s.overallRemarkNe) || '—'}</Td>
          </tr>
        </tbody>
      </table>

      {s.gpa != null && (
        <p className="cas-avoid-break mb-4 text-right text-sm font-bold">
          {t.gpa} = {s.gpa}
        </p>
      )}

      <footer className="cas-avoid-break cas-a4-foot pt-10">
        <div className="flex items-end justify-between gap-6">
          {/* Live from the school's records; the snapshot copy is only a fallback. */}
          <Signature label={t.classTeacher} name={classTeachers?.[s.student?.grade] || ''} />
          <Signature label={t.principal} name={principalName || s.school?.principalName || ''} />
          <Signature label={t.issueDate} name={issueDateOf(report)} />
        </div>
        {/* Only an unpublished preview is labelled; a published card stays clean. */}
        {report.status && report.status !== 'PUBLISHED' && (
          <p className="mt-6 border-t border-[#dfe5eb] pt-2 text-[10px] text-[#5f6b7a]">{t.draftWarning}</p>
        )}
      </footer>
    </article>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#5f6b7a]">{label}</dt>
      <dd className="font-semibold">{value || '—'}</dd>
    </div>
  );
}

function Th({ children, className = '' }) {
  return (
    <th
      className={`border border-[#dfe5eb] px-2 py-1.5 text-left text-[11px] font-bold uppercase ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }) {
  return <td className={`border border-[#dfe5eb] px-2 py-1.5 ${className}`}>{children}</td>;
}

function Signature({ label, name }) {
  return (
    <div className="min-w-[8rem] flex-1 text-center">
      <p className="mb-1 h-5 text-sm font-semibold">{name}</p>
      <p className="border-t border-[#111827] pt-1 text-[10px] uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}
