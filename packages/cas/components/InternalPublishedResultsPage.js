'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { Download as FaDownload, Printer as FaPrint } from 'lucide-react';
import StudentSearchBox from './ui/StudentSearchBox.js';
import { useCas } from './CasLayout.js';
import { useCasQuery } from '../lib/client/useCas.js';
import { downloadPdfFromPage } from '../lib/client/pdfDownload.js';
import { sectionsForGrade } from '../lib/casSections.js';
import InternalExamReport from './report/InternalExamReport.js';
import A4Viewport from './report/A4Viewport.js';
import { PageHeader, Card, Button, EmptyState, Field, Select, Spinner } from './ui/Kit.js';

/**
 * Internal Exam → Published Results, laid out like CAS's Published Results:
 * only published report cards, drawn directly below the filters, to review
 * and reprint. Unpublished exams never appear here; the Results screen is
 * where cards are checked and published.
 */
export default function InternalPublishedResultsPage() {
  const { school, years, academicYear, setYearId, lang, t } = useCas();
  const grades = school?.grades || [];
  // Filters are remembered until the page is refreshed.
  const [chosenGrade, setChosenGrade] = useRememberedState('internal-published:grade', '');
  const [section, setSection] = useRememberedState('internal-published:section', '');
  const [exam, setExam] = useRememberedState('internal-published:exam', '');
  const [student, setStudent] = useRememberedState('internal-published:student', '');
  const [search, setSearch] = useRememberedState('internal-published:search', '');
  const [downloading, setDownloading] = useState('');
  const grade = (grades.includes(chosenGrade) && chosenGrade) || grades[0] || '';
  // Only the sections the school has configured for this grade.
  const sections = sectionsForGrade(school?.gradeSections, grade);
  const activeSection = sections.includes(section) ? section : '';

  // The grade's students (in the chosen section), roll order, for the Student dropdown.
  const studentsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/students?${new URLSearchParams({ academicYear: academicYear.id, grade, ...(activeSection ? { section: activeSection } : {}) })}`
      : null,
  );
  const studentOptions = Array.isArray(studentsQuery.data) ? studentsQuery.data : [];
  const activeStudent = studentOptions.some((item) => item.id === student) ? student : '';

  const examsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/internal-exams?${new URLSearchParams({ academicYear: academicYear.id, grade })}`
      : null,
  );
  const publishedExams = (examsQuery.data?.exams || []).filter((item) => item.published);
  const activeExam = publishedExams.some((item) => item.id === exam) ? exam : '';

  const cardsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/internal-exams/published?${new URLSearchParams({
          academicYear: academicYear.id,
          grade,
          ...(activeSection ? { section: activeSection } : {}),
          ...(activeExam ? { exam: activeExam } : {}),
          ...(search ? { search } : {}),
          ...(activeStudent ? { student: activeStudent } : {}),
        })}`
      : null,
  );
  const cards = cardsQuery.data || [];

  async function download(list, key) {
    setDownloading(key);
    try {
      await downloadPdfFromPage(printHref(list, lang));
    } catch (error) {
      window.alert(error.message);
    } finally {
      setDownloading('');
    }
  }

  function changeGrade(value) {
    setChosenGrade(value);
    setSection('');
    setExam('');
    setStudent('');
  }


  return (
    <>
      <div className="cas-print-hide">
        <PageHeader
          eyebrow={t('Internal Exam', 'आन्तरिक परीक्षा')}
          title={t('Published Results', 'प्रकाशित नतिजा')}
          actions={
            <div className="flex flex-nowrap gap-2">
              <Button variant="secondary" disabled={!cards.length} onClick={() => window.print()}>
                <FaPrint className="text-xs" /> {t(`Print shown (${cards.length})`, `देखिएका प्रिन्ट (${cards.length})`)}
              </Button>
              <Button disabled={!cards.length || Boolean(downloading)} onClick={() => download(cards, 'all')}>
                <FaDownload className="text-xs" /> {downloading === 'all' ? t('Preparing PDF...', 'PDF तयार हुँदैछ...') : t(`Download PDF (${cards.length})`, `PDF डाउनलोड (${cards.length})`)}
              </Button>
            </div>
          }
        />

        <Card>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Field label={t('Academic year', 'शैक्षिक वर्ष')}>
              <Select value={academicYear?.id || ''} onChange={(event) => { setYearId(event.target.value); setSection(''); setExam(''); setStudent(''); }}>
                {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
              </Select>
            </Field>
            <Field label={t('Grade', 'कक्षा')}>
              <Select value={grade} onChange={(event) => changeGrade(event.target.value)}>
                {grades.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label={t('Section', 'सेक्सन')}>
              <Select value={activeSection} disabled={!sections.length} onChange={(event) => { setSection(event.target.value); setStudent(''); }}>
                <option value="">{sections.length ? t('All sections', 'सबै सेक्सन') : t('No sections', 'सेक्सन छैन')}</option>
                {sections.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label={t('Exam', 'परीक्षा')}>
              <Select value={activeExam} onChange={(event) => setExam(event.target.value)}>
                <option value="">{t('All published exams', 'सबै प्रकाशित परीक्षा')}</option>
                {publishedExams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            {/* One box: type to search (name, roll or result title) or pick a student. Not a <label>, so picking a suggestion does not reopen the list. */}
            <div className="mb-3 block lg:col-span-2">
              <span className="label">{t('Student, roll or result title', 'विद्यार्थी, रोल वा नतिजा शीर्षक')}</span>
              <StudentSearchBox
                t={t}
                students={studentOptions}
                loading={studentsQuery.loading}
                studentId={activeStudent}
                search={search}
                onSelectStudent={setStudent}
                onSearch={setSearch}
              />
            </div>
          </div>
        </Card>
      </div>

      {cardsQuery.loading ? <Card><Spinner label={t('Loading published report cards...', 'प्रकाशित नतिजा पत्र लोड हुँदैछ...')} /></Card>
        : cardsQuery.error ? <Card><p role="alert" className="text-sm text-danger">{cardsQuery.error}</p></Card>
          : cards.length === 0 ? (
            <Card>
              <EmptyState
                title={t('No published results match these filters', 'यी फिल्टरमा प्रकाशित नतिजा छैन')}
                description={t('Try another academic year, grade, section or exam. Results appear here once they are published on the Results screen.', 'अर्को वर्ष, कक्षा, सेक्सन वा परीक्षा छान्नुहोस्। नतिजा स्क्रिनमा प्रकाशित भएपछि यहाँ देखिन्छ।')}
              />
            </Card>
          ) : (
            <section className={`space-y-5 ${lang === 'ne' ? 'cas-ne' : ''}`}>
              <p className="cas-print-hide px-3 text-sm font-semibold text-muted">
                {t(`Showing ${cards.length} published report card${cards.length === 1 ? '' : 's'}.`, `${cards.length} प्रकाशित नतिजा पत्र देखाइँदै।`)}
              </p>
              {cards.map((card) => (
                <article key={card.id}>
                  <div className="cas-print-hide mx-auto mb-2 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{studentLabel(card)}</span>
                    <div className="flex flex-wrap gap-2">
                      <a href={printHref([card], lang, true)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex items-center gap-2 font-semibold">
                        <FaPrint className="text-xs" /> {t('Print', 'प्रिन्ट')}
                      </a>
                      <Button disabled={Boolean(downloading)} onClick={() => download([card], card.id)}>
                        <FaDownload className="text-xs" /> {downloading === card.id ? t('Preparing PDF...', 'PDF तयार हुँदैछ...') : t('Download PDF', 'PDF डाउनलोड')}
                      </Button>
                    </div>
                  </div>
                  {/* True A4 on every screen; a phone shows it shrunk, not reflowed. */}
                  <A4Viewport><InternalExamReport report={card} lang={lang} /></A4Viewport>
                </article>
              ))}
            </section>
          )}
    </>
  );
}

function printHref(cards, lang, print = false) {
  const ids = cards.map((card) => card.id).filter(Boolean);
  if (!ids.length) return '#';
  const query = new URLSearchParams({ ids: ids.join(','), lang: lang === 'ne' ? 'ne' : 'en', ...(print ? { print: '1' } : {}) });
  return `/school/internal-exam/print/published?${query}`;
}

/** The live name and roll number, as the card prints them. */
function studentLabel(card) {
  const name = card.branding?.studentName || card.snapshot?.student?.name || 'Student';
  const roll = card.branding?.studentRoll ?? card.snapshot?.student?.rollNumber;
  const exam = card.snapshot?.examTitle;
  return [roll ? `${name} (Roll ${roll})` : name, exam].filter(Boolean).join(' · ');
}
