'use client';

import { useRef, useState } from 'react';
import ReportCard from '@pravyo/cas/components/report/ReportCard';
import InternalExamReport from '@pravyo/cas/components/report/InternalExamReport';
import { downloadSheets } from '@pravyo/cas/lib/client/pdfDownload';
import { picker } from '@pravyo/cas/components/report/reportText';
import styles from './Report.module.css';

/**
 * A published continuous-assessment report, as a guardian or student reads it.
 *
 * The sheet itself is rendered by the SAME component the school prints from —
 * @pravyo/cas/components/report. This used to be a second implementation
 * living in this app, and the two drifted: a report the school built and
 * previewed in one format was silently shown to the guardian in another.
 *
 * Outcome detail stays here rather than on the sheet. The printed marksheet is
 * the formal record; per-outcome levels are a reading aid, and a guardian who
 * wants to know which outcomes are behind a grade can open them.
 */
export default function Report({ report }) {
  const [lang, setLang] = useState('en');
  const [detail, setDetail] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const sheetRef = useRef(null);

  const s = report?.snapshot;
  if (!s) return <p role="alert">This report is unavailable.</p>;

  const pick = picker(lang);
  // Internal exams are marks, not outcomes: Modern card, no outcome detail.
  const internal = report.kind === 'INTERNAL';

  async function download() {
    setDownloading(true);
    try {
      await downloadSheets(sheetRef.current?.querySelectorAll('.cas-a4') || [], `${s.student?.name || 'Report card'} - ${s.examTitle || 'Result'}`);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className={lang === 'ne' ? 'cas-ne' : undefined}>
      <div className={`${styles['report-toolbar']} cas-print-hide`}>
        <button type="button" onClick={() => setLang((v) => (v === 'ne' ? 'en' : 'ne'))}>
          {lang === 'ne' ? 'English' : 'नेपाली'}
        </button>
        {!internal && (
          <button type="button" onClick={() => setDetail((v) => !v)}>
            {detail ? 'Hide outcome details' : 'Show outcome details'}
          </button>
        )}
        <button type="button" onClick={() => window.print()}>Print</button>
        <button type="button" disabled={downloading} onClick={download}>
          {downloading ? 'Preparing PDF...' : 'Download PDF'}
        </button>
      </div>

      <div ref={sheetRef}>
        {/* CAS results always print as the Classic card. */}
        {internal ? <InternalExamReport report={report} lang={lang} /> : <ReportCard report={report} lang={lang} format="CLASSIC" />}
      </div>

      {detail && !internal && (
        <section className={`${styles.report} ${styles['report-details']}`}>
          <h2>Outcome details</h2>
          {(s.subjects || []).map((subject) => (
            <div key={subject.subjectCode}>
              <h3>{pick(subject.titleEn, subject.titleNe)}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Learning outcome</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(subject.outcomes || []).map((outcome) => (
                    <tr key={outcome.code}>
                      <td>
                        {outcome.themeEn || outcome.themeNe ? (
                          <strong>{pick(outcome.themeEn, outcome.themeNe)} - </strong>
                        ) : null}
                        {pick(outcome.titleEn, outcome.titleNe)}
                      </td>
                      <td>{outcome.acceptedLevel ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className={styles.note}>
            Levels run from 1 to 4 and are not percentage grades. Achievement counts
            only what has been assessed; anything not yet assessed is reported
            separately as coverage rather than scored as zero.
          </p>
        </section>
      )}
    </div>
  );
}
