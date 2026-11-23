'use client';

import { useEffect, useState } from 'react';
import { Pen as FaPen, Plus as FaPlus, Save as FaSave, Trash2 as FaTrash } from 'lucide-react';
import { Alert, Badge, Button, Field, Input } from './ui/Kit.js';
import { useCas } from './CasLayout.js';
import {
  AssessmentAreaCell, BookColgroup, BookHead, ToolsCell, bookEntries, bookLanguage, joinEntries,
} from './book/BookTableParts.js';

const TEXT_FIELDS = ['titleEn', 'titleNe'];

/** A row's assessment areas and tools: each a list of English/Nepali entries. */
const LISTS = {
  aspects: ['assessmentAspect', 'assessmentAspectNe'],
  tools: ['assessmentTool', 'assessmentToolNe'],
};
const blankEntry = () => ({ en: '', ne: '' });
const withBlank = (entries) => (entries.length ? entries : [blankEntry()]);

let nextRowKey = 0;
const blankRow = () => ({
  key: `new-${(nextRowKey += 1)}`,
  ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, ''])),
  aspects: [blankEntry()],
  tools: [blankEntry()],
  scored: false,
});

/** The row's list fields as the server stores them. */
function listFields(row) {
  const fields = {};
  for (const [list, [enField, neField]] of Object.entries(LISTS)) {
    const { en, ne } = joinEntries(row[list]);
    fields[enField] = en;
    fields[neField] = ne;
  }
  return fields;
}

function makeDraft(theme, rows) {
  return {
    titleEn: theme.titleEn || '',
    titleNe: theme.titleNe || '',
    workingHours: theme.workingHours == null ? '' : String(theme.workingHours),
    rows: rows.map((row) => ({
      key: row.id,
      id: row.id,
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, row[field] || ''])),
      aspects: withBlank(bookEntries(row.assessmentAspect, row.assessmentAspectNe)),
      tools: withBlank(bookEntries(row.assessmentTool, row.assessmentToolNe)),
      // Kept so the read-only view of a frozen row can show the book material.
      descriptors: row.descriptors || [],
      indicators: row.indicators || [],
      scored: Boolean(row.scored),
    })),
  };
}

const hasText = (row) =>
  TEXT_FIELDS.some((field) => row[field].trim()) ||
  Object.values(listFields(row)).some(Boolean);

/** What a save would send: an added row nobody typed into does not count. */
const savedShape = (draft) =>
  JSON.stringify({
    ...draft,
    rows: draft.rows
      .filter((row) => row.id || hasText(row))
      .map(({ aspects, tools, ...row }) => ({ ...row, ...listFields({ aspects, tools }) })),
  });

/**
 * One theme on the Curriculum screen, drawn as the assessment book itself.
 *
 * Saved: read-only, identical to the book a teacher fills in. Editing: every
 * cell the school owns is open — name, hours, rows added, reworded or deleted — and nothing is
 * written until "Save changes", which commits the whole theme at once.
 */
export default function CurriculumThemeTable({
  subject,
  theme,
  rows,
  canEdit,
  pending,
  t,
  startEditing = false,
  onSave,
  onDeleteTheme,
}) {
  const { lang, label, number, pick } = bookLanguage(useCas().lang);
  const [editing, setEditing] = useState(() => canEdit && startEditing);
  const [draft, setDraft] = useState(() => {
    const initial = makeDraft(theme, rows);
    if (startEditing && initial.rows.length === 0) initial.rows.push(blankRow());
    return initial;
  });
  const [focusKey, setFocusKey] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = editing && savedShape(draft) !== savedShape(makeDraft(theme, rows));
  const shownRows = editing ? draft.rows : rows;
  const columns = editing ? 9 : 8;
  const themeTitle = pick(theme.titleEn, theme.titleNe);

  useEffect(() => {
    if (!dirty) return undefined;
    const protectDraft = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [dirty]);

  function startEdit() {
    const next = makeDraft(theme, rows);
    if (next.rows.length === 0) next.rows.push(blankRow());
    setDraft(next);
    setFocusKey(null);
    setError('');
    setNotice('');
    setEditing(true);
  }

  function cancel() {
    if (dirty && !window.confirm(t('Discard your unsaved changes?', 'सुरक्षित नगरिएका परिवर्तन हटाउने?'))) return;
    setEditing(false);
    setError('');
  }

  function patchRow(key, patch) {
    setDraft({
      ...draft,
      rows: draft.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    });
  }

  function addRow() {
    const row = blankRow();
    setDraft({ ...draft, rows: [...draft.rows, row] });
    setFocusKey(row.key);
  }

  function patchEntry(row, list, index, patch) {
    patchRow(row.key, {
      [list]: row[list].map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });
  }

  function addEntry(row, list) {
    patchRow(row.key, { [list]: [...row[list], blankEntry()] });
  }

  function removeEntry(row, list, index) {
    patchRow(row.key, { [list]: withBlank(row[list].filter((_, at) => at !== index)) });
  }

  function deleteRow(key) {
    setDraft({ ...draft, rows: draft.rows.filter((row) => row.key !== key) });
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    // A row added but never typed into is simply dropped.
    const keptRows = draft.rows.filter((row) => row.id || hasText(row));
    if (!draft.titleEn.trim() && !draft.titleNe.trim()) {
      setError(t('Give the theme a name in English or Nepali.', 'थिमको नाम अङ्ग्रेजी वा नेपालीमा लेख्नुहोस्।'));
      return;
    }
    const missing = keptRows.findIndex((row) => !row.titleEn.trim() && !row.titleNe.trim());
    if (missing >= 0) {
      setError(t(
        `Row ${missing + 1} needs a learning outcome in English or Nepali.`,
        `पङ्क्ति ${missing + 1} मा सिकाइ उपलब्धि लेख्नुहोस्।`,
      ));
      return;
    }
    const removed = rows.filter((row) => !keptRows.some((kept) => kept.id === row.id));
    if (removed.length && !window.confirm(t(
      `Save and delete ${removed.length} row(s)? Rows with recorded scores are archived instead.`,
      `${removed.length} पङ्क्ति मेटेर सुरक्षित गर्ने? अङ्कन भइसकेका पङ्क्ति सङ्ग्रहमा राखिन्छन्।`,
    ))) return;

    const hours = String(draft.workingHours).trim();
    const result = await onSave(theme, {
      titleEn: draft.titleEn.trim(),
      titleNe: draft.titleNe.trim(),
      workingHours: hours === '' ? null : Number(hours),
      rows: keptRows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, row[field].trim()])),
        ...listFields(row),
      })),
    });
    if (result.ok) {
      setEditing(false);
      setNotice(t('Changes saved.', 'परिवर्तन सुरक्षित भयो।'));
    } else if (!result.pending) {
      setError(result.error);
    }
  }

  function cell(row, key, props) {
    return (
      <textarea
        className="input cas-book-input cas-book-field"
        rows={3}
        value={row[key]}
        disabled={pending}
        onChange={(event) => patchRow(row.key, { [key]: event.target.value })}
        {...props}
      />
    );
  }

  /** Assessment areas or tools: as many English/Nepali pairs as the outcome needs. */
  function entryEditor(row, rowIndex, list, { noun, add, placeholderEn, placeholderNe }) {
    const entries = row[list];
    return (
      <div className="cas-book-editor">
        {entries.map((entry, index) => {
          const which = t(
            `Row ${rowIndex + 1} ${noun} ${index + 1}`,
            `पङ्क्ति ${rowIndex + 1} ${noun} ${index + 1}`,
          );
          return (
            <div key={index} className="cas-book-entry">
              <input
                className="input cas-book-input cas-book-field"
                lang="en"
                maxLength={200}
                value={entry.en}
                disabled={pending}
                placeholder={placeholderEn}
                aria-label={`${which} ${t('in English', '(अङ्ग्रेजी)')}`}
                onChange={(event) => patchEntry(row, list, index, { en: event.target.value.replace(/\n/g, ' ') })}
              />
              <input
                className="input cas-book-input cas-book-field"
                lang="ne"
                maxLength={200}
                value={entry.ne}
                disabled={pending}
                placeholder={placeholderNe}
                aria-label={`${which} ${t('in Nepali', '(नेपाली)')}`}
                onChange={(event) => patchEntry(row, list, index, { ne: event.target.value.replace(/\n/g, ' ') })}
              />
              {(entries.length > 1 || entry.en || entry.ne) && (
                <button
                  type="button"
                  className="cas-book-entry-remove"
                  disabled={pending}
                  onClick={() => removeEntry(row, list, index)}
                >
                  <FaTrash aria-hidden="true" />
                  <span className="sr-only">{t(`Remove ${which}`, `${which} हटाउनुहोस्`)}</span>
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="cas-book-entry-add"
          disabled={pending || entries.length >= 10}
          onClick={() => addEntry(row, list)}
        >
          <FaPlus aria-hidden="true" /> {add}
        </button>
      </div>
    );
  }

  const saveButtons = (
    <>
      <Button variant="ghost" disabled={pending} onClick={cancel}>
        {t('Cancel', 'रद्द')}
      </Button>
      <Button type="submit" disabled={pending}>
        <FaSave aria-hidden="true" />
        {pending ? t('Saving...', 'सुरक्षित हुँदै...') : t('Save changes', 'परिवर्तन सुरक्षित गर्नुहोस्')}
      </Button>
    </>
  );

  return (
    <form className={`cas-book-theme ${editing ? 'cas-book-theme-editing' : ''}`} onSubmit={save}>
      <div className="cas-book-theme-bar">
        <div>
          <Badge tone={editing ? 'info' : 'neutral'}>
            {editing ? t('Editing', 'सम्पादन हुँदै') : t('Saved', 'सुरक्षित')}
          </Badge>
          <Badge tone="neutral">
            {shownRows.length} {t('rows', 'पङ्क्ति')}
          </Badge>
        </div>
        {canEdit && (
          <div>
            {editing ? (
              <>
                <Button variant="ghost" disabled={pending} onClick={() => onDeleteTheme(theme)}>
                  <FaTrash className="" /> {t('Delete theme', 'थिम मेट्नुहोस्')}
                </Button>
                {saveButtons}
              </>
            ) : (
              <>
                {/* Delete is offered without entering Edit, so a school can
                    remove a theme it does not want (asks first; a theme with
                    recorded marks is archived, not deleted). */}
                <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => onDeleteTheme(theme)}>
                  <FaTrash className="" /> {t('Delete theme', 'थिम मेट्नुहोस्')}
                </Button>
                <Button variant="secondary" disabled={pending} onClick={startEdit}>
                  <FaPen className="" /> {t('Edit', 'सम्पादन')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="grid gap-x-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,9rem)]">
          <Field label={`${label('Theme', 'थिम')} ${number(theme.sequence || 1)} · ${t('Name', 'नाम')}`} required>
            <Input
              value={draft.titleEn}
              maxLength={200}
              disabled={pending}
              placeholder={t('Name in English', 'अङ्ग्रेजीमा नाम')}
              onChange={(event) => setDraft({ ...draft, titleEn: event.target.value })}
            />
          </Field>
          <Field label={t('Name (Nepali)', 'नाम (नेपाली)')}>
            <Input
              lang="ne"
              className="cas-ne"
              value={draft.titleNe}
              maxLength={200}
              disabled={pending}
              placeholder={t('Name in Nepali', 'नेपालीमा नाम')}
              onChange={(event) => setDraft({ ...draft, titleNe: event.target.value })}
            />
          </Field>
          <Field label={label('Working hours', 'कार्य घण्टा')}>
            <Input
              type="number"
              min="0"
              max="500"
              value={draft.workingHours}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, workingHours: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="cas-book-heading" lang={lang}>
          <h2>
            {label('Theme', 'थिम')} {number(theme.sequence || 1)} : {themeTitle}
          </h2>
          {theme.workingHours != null && (
            <span>
              {label('Working hours', 'कार्य घण्टा')} : {number(theme.workingHours)}
            </span>
          )}
        </div>
      )}
      {editing && (
        <p className="cas-book-date-note">
          {t(
            'Nothing is saved until you click Save changes. Scores already recorded on a row stay with it when you reword it; deleting a scored row archives it.',
            '“परिवर्तन सुरक्षित गर्नुहोस्” नथिचेसम्म केही सुरक्षित हुँदैन। पङ्क्ति परिवर्तन गर्दा भइसकेको अङ्कन त्यही पङ्क्तिमा रहन्छ; अङ्कन भएको पङ्क्ति मेट्दा सङ्ग्रहमा राखिन्छ।',
          )}
        </p>
      )}

      <div
        className="cas-book-scroll"
        tabIndex={0}
        role="region"
        aria-label={t(
          'Theme learning outcomes; scroll horizontally for all columns',
          'थिमका सिकाइ उपलब्धि; सबै स्तम्भ हेर्न दायाँ-बायाँ सार्नुहोस्',
        )}
      >
        <table className="cas-book-table" lang={lang}>
          <caption className="sr-only">
            {pick(subject.titleEn, subject.titleNe)} — {themeTitle}
          </caption>
          <BookColgroup withActions={editing} />
          <BookHead
            label={label}
            withActions={editing}
            actionsLabel={t('Row actions', 'पङ्क्ति कार्य')}
          />
          <tbody>
            {shownRows.map((row, index) => (
              <tr key={editing ? row.key : row.id} className={editing ? 'cas-book-row-editing' : ''}>
                <td className="cas-book-serial">{number(index + 1)}.</td>
                {editing ? (
                  <>
                    <td>
                      <div className="cas-book-editor">
                        {cell(row, 'titleEn', {
                          lang: 'en',
                          maxLength: 1000,
                          placeholder: t('Learning outcome in English', 'सिकाइ उपलब्धि (अङ्ग्रेजी)'),
                          'aria-label': t(`Row ${index + 1} learning outcome in English`, `पङ्क्ति ${index + 1} सिकाइ उपलब्धि (अङ्ग्रेजी)`),
                          autoFocus: row.key === focusKey,
                        })}
                        {cell(row, 'titleNe', {
                          lang: 'ne',
                          maxLength: 1000,
                          placeholder: t('Learning outcome in Nepali', 'सिकाइ उपलब्धि (नेपाली)'),
                          'aria-label': t(`Row ${index + 1} learning outcome in Nepali`, `पङ्क्ति ${index + 1} सिकाइ उपलब्धि (नेपाली)`),
                        })}
                        {row.scored && (
                          <span className="cas-book-secondary cas-book-scored">
                            {t('Has recorded scores', 'अङ्कन भइसकेको')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {entryEditor(row, index, 'aspects', {
                        noun: t('area', 'पक्ष'),
                        add: t('Add area', 'पक्ष थप्नुहोस्'),
                        placeholderEn: t('In English, e.g. Listening', 'अङ्ग्रेजीमा, जस्तै: Listening'),
                        placeholderNe: t('In Nepali', 'नेपालीमा, जस्तै: सुनाइ'),
                      })}
                    </td>
                    <td>
                      {entryEditor(row, index, 'tools', {
                        noun: t('tool', 'साधन'),
                        add: t('Add tool', 'साधन थप्नुहोस्'),
                        placeholderEn: t('In English, e.g. Observation', 'अङ्ग्रेजीमा, जस्तै: Observation'),
                        placeholderNe: t('In Nepali', 'नेपालीमा, जस्तै: अवलोकन'),
                      })}
                    </td>
                  </>
                ) : (
                  <>
                    <th scope="row" className="cas-book-outcome">
                      {pick(row.titleEn, row.titleNe)}
                    </th>
                    <td>
                      <AssessmentAreaCell row={row} label={label} number={number} pick={pick} />
                    </td>
                    <td><ToolsCell row={row} pick={pick} /></td>
                  </>
                )}
                <ScoreCells />
                {editing && (
                  <td>
                    <div className="cas-book-row-actions">
                      <button type="button" disabled={pending} onClick={() => deleteRow(row.key)}>
                        <FaTrash aria-hidden="true" />
                        <span className="sr-only">
                          {t(`Delete row ${index + 1}`, `पङ्क्ति ${index + 1} मेट्नुहोस्`)}
                        </span>
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {shownRows.length === 0 && (
              <tr>
                <td colSpan={columns} className="cas-book-serial">
                  {t(
                    'No learning-outcome rows yet. Click Edit to add rows.',
                    'सिकाइ उपलब्धि पङ्क्ति छैन। पङ्क्ति थप्न “सम्पादन” थिच्नुहोस्।',
                  )}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                {label('Total learning outcomes', 'जम्मा सिकाइ उपलब्धि सङ्ख्या')} ={' '}
                {number(shownRows.length)} ({label('theme full marks', 'थिमगत पूर्णाङ्क')} ={' '}
                {number(shownRows.length)} × {number(4)} = {number(shownRows.length * 4)})
              </td>
              <th colSpan={4} scope="row">{label('Total obtained', 'जम्मा प्राप्ताङ्क')}</th>
              <td className="cas-book-total">—</td>
              {columns > 8 && <td colSpan={columns - 8} />}
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !editing && <Alert tone="success">{notice}</Alert>}

      {canEdit && editing && (
        <div className="cas-book-theme-footer">
          <div>
            <Button variant="secondary" disabled={pending} onClick={addRow}>
              <FaPlus className="" /> {t('Add row', 'पङ्क्ति थप्नुहोस्')}
            </Button>
          </div>
          <div>
            {saveButtons}
          </div>
        </div>
      )}
    </form>
  );
}

/** The teacher's columns, drawn exactly as the book draws them but inert here. */
function ScoreCells() {
  return (
    <>
      <td><input type="date" className="input cas-book-input" disabled tabIndex={-1} aria-hidden="true" /></td>
      <td>
        <select className="input cas-book-input cas-book-mark" disabled tabIndex={-1} aria-hidden="true" defaultValue="">
          <option value="">—</option>
        </select>
      </td>
      <td><input type="date" className="input cas-book-input" disabled tabIndex={-1} aria-hidden="true" /></td>
      <td>
        <select className="input cas-book-input cas-book-mark" disabled tabIndex={-1} aria-hidden="true" defaultValue="">
          <option value="">—</option>
        </select>
      </td>
    </>
  );
}
