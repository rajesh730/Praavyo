'use client';

import { useState } from 'react';
import { useRememberedState } from '@pravyo/ui/rememberedState';
import { Download as FaDownload, Printer as FaPrint, Search as FaSearch } from 'lucide-react';
import { useCas } from './CasLayout.js';
import { useCasQuery } from '../lib/client/useCas.js';
import { downloadPdfFromPage } from '../lib/client/pdfDownload.js';
import { sectionsForGrade } from '../lib/casSections.js';
import ReportCard from './report/ReportCard.js';
import {
  PageHeader, Card, Button, EmptyState, Field, Input, Select, Spinner,
} from './ui/Kit.js';

// CAS results are always drawn in the Classic layout, whatever format an
// older card was stored with. Internal exams have their own Modern card.
const format = 'CLASSIC';

/**
 * Published report cards are rendered directly below the filters. This is a
 * review and reprint surface, not a register that makes staff open each card
 * one at a time.
 */
export default function PublishedResultsPage() {
  const { school, years, academicYear, setYearId, lang } = useCas();
  const grades = school?.grades || [];
  // Filters are remembered until the page is refreshed.
  const [chosenGrade, setChosenGrade] = useRememberedState('cas-published:grade', '');
  const [section, setSection] = useRememberedState('cas-published:section', '');
  const [exam, setExam] = useRememberedState('cas-published:exam', '');
  const [searchInput, setSearchInput] = useRememberedState('cas-published:search-input', '');
  const [search, setSearch] = useRememberedState('cas-published:search', '');
  const [showAssessedThemes, setShowAssessedThemes] = useRememberedState('cas-published:show-themes', false);
  const [downloading, setDownloading] = useState('');
  const grade = (grades.includes(chosenGrade) && chosenGrade) || grades[0] || '';
  // Live sections plus any a published card was issued under, so results
  // for a section deleted since stay findable here.
  const sectionsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/reports/sections?${new URLSearchParams({ academicYear: academicYear.id, grade })}`
      : null,
  );
  const sections = sectionsQuery.data || sectionsForGrade(school?.gradeSections, grade);

  const examsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/exams?${new URLSearchParams({ academicYear: academicYear.id, grade, includeArchived: 'true' })}`
      : null,
  );
  const reportsQuery = useCasQuery(
    academicYear?.id && grade
      ? `/api/cas/reports?${new URLSearchParams({
          academicYear: academicYear.id,
          grade,
          status: 'PUBLISHED',
          ...(section ? { section } : {}),
          ...(exam ? { exam } : {}),
          ...(search ? { search } : {}),
        })}`
      : null,
  );
  const reports = reportsQuery.data || [];

  async function download(list, key) {
    setDownloading(key);
    try {
      await downloadPdfFromPage(publishedHref(list, lang, false, format));
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
  }

  function applySearch() {
    setSearch(searchInput.trim());
  }

  return (
    <>
      <div className="cas-print-hide">
        <PageHeader
          title="Published Results"
          description="Published report cards are shown below. Use filters to narrow the cards before reviewing or printing them."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!reports.length} onClick={() => window.print()}>
                <FaPrint className="text-xs" /> Print shown ({reports.length})
              </Button>
              <Button disabled={!reports.length || Boolean(downloading)} onClick={() => download(reports, 'all')}>
                <FaDownload className="text-xs" /> {downloading === 'all' ? 'Preparing PDF...' : `Download PDF (${reports.length})`}
              </Button>
            </div>
          }
        />

        <Card>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Field label="Academic year">
              <Select value={academicYear?.id || ''} onChange={(event) => { setYearId(event.target.value); setSection(''); setExam(''); }}>
                {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
              </Select>
            </Field>
            <Field label="Grade">
              <Select value={grade} onChange={(event) => changeGrade(event.target.value)}>
                {grades.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Section">
              <Select value={section} disabled={!sections.length} onChange={(event) => setSection(event.target.value)}>
                <option value="">All sections</option>
                {sections.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Exam">
              <Select value={exam} onChange={(event) => setExam(event.target.value)}>
                <option value="">All exams</option>
                {(examsQuery.data?.exams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Student, roll or result title">
              <div className="flex gap-2">
                <Input value={searchInput} placeholder="Search" onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') applySearch(); }} />
                <Button className="px-3" aria-label="Search published results" onClick={applySearch}><FaSearch /></Button>
              </div>
            </Field>
            <Field label="Display">
              <label className="btn btn-secondary flex cursor-pointer items-center gap-2 font-medium">
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand-primary)]" checked={showAssessedThemes} onChange={(event) => setShowAssessedThemes(event.target.checked)} />
                Show assessed themes
              </label>
            </Field>
          </div>
        </Card>
      </div>

      {reportsQuery.loading ? <Card><Spinner label="Loading published report cards..." /></Card>
        : reportsQuery.error ? <Card><p role="alert" className="text-sm text-danger">{reportsQuery.error}</p></Card>
          : reports.length === 0 ? <Card><EmptyState title="No published results match these filters" description="Try another academic year, grade, section or exam." /></Card>
            : <section className="space-y-5">
              <p className="cas-print-hide px-3 text-sm font-semibold text-muted">Showing {reports.length} published report card{reports.length === 1 ? '' : 's'}.</p>
              {reports.map((report) => (
                <article key={report.id}>
                  <div className="cas-print-hide mx-auto mb-2 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{studentLabel(report)}</span>
                    <div className="flex flex-wrap gap-2">
                      <a href={publishedHref([report], lang, true, format)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex items-center gap-2 font-semibold">
                        <FaPrint className="text-xs" /> Print
                      </a>
                      <Button disabled={Boolean(downloading)} onClick={() => download([report], report.id)}>
                        <FaDownload className="text-xs" /> {downloading === report.id ? 'Preparing PDF...' : 'Download PDF'}
                      </Button>
                    </div>
                  </div>
                  {showAssessedThemes && <div className="cas-print-hide mx-auto mb-3 max-w-[210mm]"><Card title="Assessed themes">{themeSummary(report.snapshot?.selectedThemes)}</Card></div>}
                  <ReportCard report={report} lang={lang} format={format || undefined} />
                </article>
              ))}
            </section>}
    </>
  );
}

function publishedHref(reports, lang, print = false, format = '') {
  const ids = reports.map((report) => report.id).filter(Boolean);
  if (!ids.length) return '#';

  const query = new URLSearchParams({
    ids: ids.join(','),
    lang: lang === 'ne' ? 'ne' : 'en',
    ...(format ? { format } : {}),
    ...(print ? { print: '1' } : {}),
  });
  return `/school/cas/print/published?${query}`;
}

function studentLabel(report) {
  const student = report.snapshot?.student || {};
  const name = student.name || 'Student';
  return student.rollNumber ? `${name} (Roll ${student.rollNumber})` : name;
}

function themeSummary(themes) {
  if (!Array.isArray(themes) || themes.length === 0) return <p className="text-sm text-muted">No theme record was saved with this result.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {themes.map((theme, index) => (
        <li key={`${theme.assignment || theme.themeKey || 'theme'}-${index}`}>
          <span className="font-semibold text-ink">{theme.subjectTitle || 'Subject'}:</span>{' '}
          {theme.themeTitle || theme.themeKey || 'Theme'}
        </li>
      ))}
    </ul>
  );
}
