'use client';

import { useEffect, useRef, useState } from 'react';
import { Save as FaSave } from 'lucide-react';
import { useCasMutation } from '../lib/client/useCas.js';
import { acceptedRowLevel, summariseRows } from '../lib/client/sheetTotals.js';
import { Card, Button, Alert } from './ui/Kit.js';
import { useCas } from './CasLayout.js';
import {
  AssessmentAreaCell, BookColgroup, BookHead, ToolsCell, bookLanguage, nepaliDigits,
} from './book/BookTableParts.js';

/** A score at or below this may be reassessed; mirrors canReassess on the server. */
const REASSESS_MAX = 3;

function makeDraft(sheet) {
  return Object.fromEntries(sheet.rows.map((row) => [row.outcome, {
    revision: row.revision ?? 0,
    regularDate: row.regularDate || '',
    regularLevel: row.regularLevel ?? null,
    remedialDate: row.remedialDate || '',
    remedialLevel: row.remedialLevel ?? null,
    remarks: row.remarks || '',
  }]));
}

function inputStatus(level) {
  return rowStatus(level);
}

function rowStatus(level) {
  if (level == null) return '';
  if (level < 3) return 'needs';
  if (level < 4) return 'support';
  return 'ok';
}

export default function AssessmentBook({
  sheet,
  t,
  cachedDraft,
  onDraftChange,
  onSavingChange,
  onSaved,
}) {
  const { run, pending, error, success, setError, setSuccess } = useCasMutation();
  const [draft, setDraft] = useState(() => ({ ...makeDraft(sheet), ...cachedDraft }));
  const draftRef = useRef(draft);
  const baseRef = useRef(makeDraft(sheet));
  const [remoteUpdate, setRemoteUpdate] = useState(false);
  const { lang: casLang, api } = useCas();
  const { lang, label, number, pick } = bookLanguage(casLang);
  const pageTotals = summariseRows(sheet.rows, draft);
  // Grades 6-10 have no agreed result rule yet: obtained marks only.
  const totals = sheet.resultAvailable === false
    ? { ...pageTotals, percent: null, grade: null }
    : pageTotals;
  const disabled = sheet.locked || !sheet.canRecord || pending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(makeDraft(sheet));
  const acceptedNow = (row) => acceptedRowLevel(row, draft[row.outcome]);
  const needsSupport = sheet.rows.filter((row) => {
    const level = acceptedNow(row);
    return level != null && level < 3;
  });
  const mayReassess = sheet.rows.filter((row) => acceptedNow(row) === REASSESS_MAX);
  const assessedRows = sheet.rows.filter((row) => acceptedNow(row) != null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const nextBase = makeDraft(sheet);
    const changedOnServer = JSON.stringify(nextBase) !== JSON.stringify(baseRef.current);
    if (!changedOnServer) return;
    const hasLocalEdits = JSON.stringify(draftRef.current) !== JSON.stringify(baseRef.current);
    baseRef.current = nextBase;
    if (hasLocalEdits) {
      setRemoteUpdate(true);
      return;
    }
    setDraft(nextBase);
    onDraftChange(nextBase);
    setRemoteUpdate(false);
  }, [sheet, onDraftChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const protectDraft = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [dirty]);

  function update(outcome, patch) {
    if (patch.regularLevel === null) {
      patch = { ...patch, regularDate: '', remedialLevel: null, remedialDate: '' };
    }
    if (patch.remedialLevel === null) patch = { ...patch, remedialDate: '' };
    const next = { ...draft, [outcome]: { ...draft[outcome], ...patch } };
    setDraft(next);
    onDraftChange(next);
    setSuccess('');
    setError('');
  }

  function updateRegular(row, level) {
    const current = draft[row.outcome];
    const patch = {
      regularLevel: level,
      regularDate: level !== null && !current.regularDate ? sheet.today : current.regularDate,
    };
    // A draft reassessment is only kept while the regular result can be reassessed.
    if (current.remedialLevel != null && (level == null || level > REASSESS_MAX)) {
      patch.remedialLevel = null;
      patch.remedialDate = '';
    }
    update(row.outcome, patch);
  }

  function updateRemedial(row, level) {
    const current = draft[row.outcome];
    // Choosing "—" clears the extra-support score, saved or not: until the
    // result is published a mistaken score can be removed.
    update(row.outcome, {
      remedialLevel: level,
      remedialDate: level !== null && !current.remedialDate ? sheet.today : current.remedialDate,
    });
  }

  async function save(event) {
    event.preventDefault();
    if (disabled || !dirty) return;
    onSavingChange(true);
    try {
      const result = await run(api.cas('/sheet'), {
        method: 'POST',
        body: {
          academicYear: sheet.year.id,
          exam: sheet.exam.id,
          grade: sheet.grade,
          subject: sheet.subject.id,
          themeKey: sheet.theme.key,
          student: sheet.student.id,
          rows: sheet.rows.map((row) => ({ outcome: row.outcome, ...draft[row.outcome] })),
        },
      }, {
        successMessage: t(
          'Saved to the school database.',
          'विद्यालय डाटाबेसमा सुरक्षित भयो।',
        ),
      });
      if (result.ok) {
        const savedDraft = makeDraft(result.data.sheet);
        baseRef.current = savedDraft;
        setDraft(savedDraft);
        setRemoteUpdate(false);
        onSaved(result.data.sheet);
      }
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form onSubmit={save}>
      {sheet.locked && (
        <Alert tone="warning">
          {t(
            'This result is published, so these marks are locked. To change them, the school unpublishes the exam in Manage Exams, edits, and publishes again.',
            'यो नतिजा प्रकाशित भइसकेकाले यी अङ्क लक छन्। परिवर्तन गर्न विद्यालयले परीक्षा व्यवस्थापनमा परीक्षा अप्रकाशित गरी सच्याएर फेरि प्रकाशित गर्छ।',
          )}
        </Alert>
      )}
      {!sheet.canRecord && !sheet.locked && (
        <Alert tone="info">
          {t(
            'You have read-only access. A school administrator can record assessments.',
            'तपाईंले अभिलेख हेर्न सक्नुहुन्छ। विद्यालय प्रशासकले मूल्याङ्कन भर्न सक्छन्।',
          )}
        </Alert>
      )}
      {remoteUpdate && (
        <Alert tone="warning">
          {t(
            'Another assigned teacher saved changes to this page. Your unsaved entries are preserved, but reload before saving if you need to review their changes.',
            'Another assigned teacher saved changes to this page. Your unsaved entries are preserved, but reload before saving if you need to review their changes.',
          )}
        </Alert>
      )}
      <Card className="cas-book">
        <div className="cas-book-identity">
          <strong>{sheet.student.name}</strong>
          <span>
            {t('Roll', 'रोल')} {sheet.student.rollNumber || '—'} · {sheet.grade} ·{' '}
            {pick(sheet.subject.titleEn, sheet.subject.titleNe)} · {sheet.year.label}
          </span>
        </div>
        <div className="cas-book-heading" lang={lang}>
          <h2>
            {label('Theme', 'थिम')} {number(sheet.theme.sequence || 1)} :{' '}
            {pick(sheet.theme.titleEn, sheet.theme.titleNe)}
          </h2>
          {sheet.theme.workingHours != null && (
            <span>
              {label('Working hours', 'कार्य घण्टा')} : {number(sheet.theme.workingHours)}
            </span>
          )}
        </div>
        <p className="cas-book-date-note">
          {t(
            'Dates use the AD calendar. Choosing a score fills today’s date automatically.',
            'मिति इस्वी संवत् हो। अङ्क छानेपछि आजको मिति आफैँ भरिन्छ।',
          )}
        </p>
        <div className={`cas-book-recommendation ${
          needsSupport.length ? 'cas-book-recommendation-warn' : assessedRows.length ? 'cas-book-recommendation-ok' : ''
        }`}>
          <strong>{t('Reassessment recommendation', 'पुनः मूल्याङ्कन सुझाव')}</strong>
          {needsSupport.length ? (
            <span>
              {t(
                `Give extra support and reassess row ${needsSupport.map((row) => row.serial).join(', ')}.`,
                `पङ्क्ति ${needsSupport.map((row) => nepaliDigits(row.serial)).join(', ')} मा थप सहयोग दिई पुनः मूल्याङ्कन गर्नुहोस्।`,
              )}
            </span>
          ) : mayReassess.length ? (
            <span>
              {t(
                `No row needs reassessment. Row ${mayReassess.map((row) => row.serial).join(', ')} scored 3 and may be reassessed.`,
                `पुनः मूल्याङ्कन अनिवार्य छैन। पङ्क्ति ${mayReassess.map((row) => nepaliDigits(row.serial)).join(', ')} मा ३ आएकाले चाहेमा पुनः मूल्याङ्कन गर्न सकिन्छ।`,
              )}
            </span>
          ) : assessedRows.length ? (
            <span>
              {t(
                'Rows scored 4 are complete and are not reassessed.',
                'स्तर ४ भएका पङ्क्ति पूरा भएका छन्, पुनः मूल्याङ्कन हुँदैन।',
              )}
            </span>
          ) : (
            <span>
              {t(
                'Choose a score to generate today’s assessment date.',
                'अङ्क छानेपछि आजको मिति आफैँ आउँछ।',
              )}
            </span>
          )}
        </div>
        <div
          className="cas-book-scroll"
          tabIndex={0}
          role="region"
          aria-label={t(
            'Student assessment record; scroll horizontally for all columns',
            'विद्यार्थी मूल्याङ्कन अभिलेख; सबै स्तम्भ हेर्न दायाँ-बायाँ सार्नुहोस्',
          )}
        >
          <table className="cas-book-table" lang={lang}>
            <caption className="sr-only">
              {sheet.student.name} — {pick(sheet.subject.titleEn, sheet.subject.titleNe)} —{' '}
              {pick(sheet.theme.titleEn, sheet.theme.titleNe)}
            </caption>
            <BookColgroup />
            <BookHead label={label} />
            <tbody>
              {sheet.rows.map((row) => {
                const value = draft[row.outcome];
                const acceptedLevel = acceptedNow(row);
                const status = rowStatus(acceptedLevel);
                const regularDateLocked = disabled || value.regularLevel == null;
                // Every score stays editable until the result is published
                // (then `disabled` locks the whole page).
                const regularMarkLocked = disabled;
                const canUseRemedial = value.regularLevel != null && acceptedLevel != null && acceptedLevel <= REASSESS_MAX;
                const remedialDisabled = disabled || (!canUseRemedial && value.remedialLevel == null);
                const regularStatus = inputStatus(value.regularLevel);
                const remedialStatus = status || inputStatus(value.remedialLevel);
                return (
                  <tr key={row.outcome} className={status ? `cas-book-row-${status}` : ''}>
                    <td className="cas-book-serial">{number(row.serial)}.</td>
                    <th scope="row" className="cas-book-outcome">
                      {pick(row.titleEn, row.titleNe)}
                    </th>
                    <td>
                      <AssessmentAreaCell row={row} label={label} number={number} pick={pick} />
                    </td>
                    <td><ToolsCell row={row} pick={pick} /></td>
                    <td>
                      <input
                        type="date"
                        className={`input cas-book-input cas-book-date-${regularStatus}`}
                        aria-label={`Regular date, outcome ${row.serial}`}
                        value={value.regularDate}
                        disabled={regularDateLocked}
                        required={value.regularLevel !== null}
                        min={sheet.year.startDate}
                        max={sheet.today}
                        onChange={(event) => update(row.outcome, { regularDate: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="input cas-book-input cas-book-mark"
                        aria-label={`Regular mark, outcome ${row.serial}`}
                        value={value.regularLevel ?? ''}
                        disabled={regularMarkLocked}
                        required={Boolean(value.regularDate)}
                        onChange={(event) =>
                          updateRegular(row, event.target.value ? Number(event.target.value) : null)
                        }
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4].map((level) => (
                          <option key={level} value={level}>{number(level)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        className={`input cas-book-input cas-book-date-${remedialStatus}`}
                        aria-label={`Remedial date, outcome ${row.serial}`}
                        value={value.remedialDate}
                        disabled={remedialDisabled}
                        required={value.remedialLevel !== null}
                        min={value.regularDate || sheet.year.startDate}
                        max={sheet.today}
                        onChange={(event) => update(row.outcome, { remedialDate: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="input cas-book-input cas-book-mark"
                        aria-label={`Remedial mark, outcome ${row.serial}`}
                        value={value.remedialLevel ?? ''}
                        disabled={remedialDisabled}
                        required={Boolean(value.remedialDate)}
                        onChange={(event) =>
                          updateRemedial(row, event.target.value ? Number(event.target.value) : null)
                        }
                      >
                        <option value="">—</option>
                        {[1, 2, 3, 4].map((level) => (
                          <option key={level} value={level}>{number(level)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <textarea
                        className="input cas-book-input cas-book-remarks"
                        rows={2}
                        aria-label={`Remarks, outcome ${row.serial}`}
                        value={value.remarks}
                        disabled={disabled}
                        maxLength={1000}
                        onChange={(event) => update(row.outcome, { remarks: event.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  {label('Total learning outcomes', 'जम्मा सिकाइ उपलब्धि सङ्ख्या')} ={' '}
                  {number(totals.outcomeCount)} ({label('theme full marks', 'थिमगत पूर्णाङ्क')} ={' '}
                  {number(totals.outcomeCount)} × {number(4)} = {number(totals.fullMarks)})
                </td>
                <th colSpan={4} scope="row">{label('Total obtained', 'जम्मा प्राप्ताङ्क')}</th>
                <td className="cas-book-total">{totals.assessedCount ? number(totals.obtained) : '—'}</td>
                <td rowSpan={3} />
              </tr>
              <tr>
                <td colSpan={3}>{label("Parent's signature :", 'अभिभावकको दस्तखत :')}</td>
                <th colSpan={4} scope="row">{label('Achievement percentage', 'उपलब्धि प्रतिशत')}</th>
                <td className="cas-book-total">
                  {totals.percent === null ? '—' : number(totals.percent.toFixed(2))}
                </td>
              </tr>
              <tr>
                <td colSpan={3}>{label("Teacher's signature and date :", 'शिक्षकको दस्तखत र मिति :')}</td>
                <th colSpan={4} scope="row">{label('Grade', 'ग्रेड')}</th>
                <td className="cas-book-total">{totals.grade || '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="cas-book-actions">
          <Button type="submit" disabled={disabled || !dirty}>
            <FaSave aria-hidden="true" />
            {pending
              ? t('Saving...', 'सुरक्षित हुँदै...')
              : t('Send to school database', 'विद्यालय डाटाबेसमा पठाउनुहोस्')}
          </Button>
          <p>
            {t(
              `${totals.assessedCount} of ${totals.outcomeCount} outcomes assessed`,
              `${nepaliDigits(totals.outcomeCount)} मध्ये ${nepaliDigits(totals.assessedCount)} मूल्याङ्कन भयो`,
            )}
            {totals.assessedCount > 0 && totals.assessedCount < totals.outcomeCount && (
              <span className="block">
                {t(
                  'Percentage is based on assessed outcomes only.',
                  'प्रतिशत मूल्याङ्कन भएका उपलब्धिमा मात्र आधारित छ।',
                )}
              </span>
            )}
          </p>
        </div>
        {sheet.rows.some((row) => row.regularLevel != null) && !sheet.locked && (
          <p className="cas-book-date-note">
            {t(
              'Entered a wrong score? Change it, or choose “—” to clear it, then send again. Scores can be corrected until the result is published. The obtained total uses the higher score between regular assessment and reassessment.',
              'गलत अङ्क भर्नुभयो? सच्याउनुहोस् वा “—” छानेर हटाउनुहोस्, अनि फेरि पठाउनुहोस्। नतिजा प्रकाशित नभएसम्म अङ्क सच्याउन सकिन्छ। प्राप्ताङ्कमा नियमित मूल्याङ्कन र पुनः मूल्याङ्कनमध्ये ठूलो अङ्क प्रयोग हुन्छ।',
            )}
          </p>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}
      </Card>
    </form>
  );
}
