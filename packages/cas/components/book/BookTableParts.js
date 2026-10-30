'use client';

/**
 * The printed assessment book's table frame, shared by the two screens that
 * draw it: Curriculum, where a school writes the rows, and Assessment, where a
 * teacher scores them.
 *
 * Both import the same colgroup and header so the curriculum table a school
 * builds is literally the book its teachers will fill in — column for column,
 * merged heading for merged heading — instead of two layouts that drift apart.
 */

export const nepaliDigits = (value) =>
  String(value).replace(/\d/g, (digit) => '०१२३४५६७८९'[Number(digit)]);

/**
 * The book follows the display language chosen in the header (EN / ने):
 * headings, digits and the school's own text all switch together. `pick`
 * shows the school's text in that language, falling back to the other one
 * only when a translation has not been written.
 */
export function bookLanguage(displayLanguage = 'en') {
  const english = displayLanguage !== 'ne';
  return {
    english,
    lang: english ? 'en' : 'ne',
    label: (en, ne) => (english ? en : ne),
    pick: (en, ne) => (english ? en || ne : ne || en) || '',
    number: (value) => (english ? String(value) : nepaliDigits(value)),
  };
}

/** Curriculum adds one narrow column for its row controls; the book has none. */
export function BookColgroup({ withActions = false }) {
  return (
    <colgroup>
      <col className="cas-book-col-serial" />
      <col className="cas-book-col-outcome" />
      <col className="cas-book-col-aspect" />
      <col className="cas-book-col-tool" />
      <col className="cas-book-col-date" />
      <col className="cas-book-col-mark" />
      <col className="cas-book-col-date" />
      <col className="cas-book-col-mark" />
      <col className="cas-book-col-remarks" />
      {withActions && <col className="cas-book-col-actions" />}
    </colgroup>
  );
}

export function BookHead({ label, withActions = false, actionsLabel = '' }) {
  return (
    <thead>
      <tr>
        <th rowSpan={2} scope="col">
          <span className="sr-only">{label('S.N.', 'क्र.सं.')}</span>
        </th>
        <th rowSpan={2} scope="col">{label('Main learning outcomes', 'मुख्य सिकाइ उपलब्धि')}</th>
        <th rowSpan={2} scope="col">{label('Assessment areas', 'परीक्षण गर्ने पक्ष')}</th>
        <th rowSpan={2} scope="col">{label('Tools', 'साधन')}</th>
        <th colSpan={2} scope="colgroup">{label('Regular assessment', 'नियमित पढाइको मूल्याङ्कन')}</th>
        <th colSpan={2} scope="colgroup">{label('Assessment after extra support', 'थप सहायतापछिको मूल्याङ्कन')}</th>
        <th rowSpan={2} scope="col">{label('Remarks', 'कैफियत')}</th>
        {withActions && (
          <th rowSpan={2} scope="col">
            <span className="sr-only">{actionsLabel}</span>
          </th>
        )}
      </tr>
      <tr>
        <th scope="col">{label('Date', 'मिति')}</th>
        <th scope="col">{label('Score', 'अङ्कन')}</th>
        <th scope="col">{label('Date', 'मिति')}</th>
        <th scope="col">{label('Score', 'अङ्कन')}</th>
      </tr>
    </thead>
  );
}

/**
 * An outcome can carry several assessment areas and several tools. Each list
 * is stored in the existing English and Nepali fields, one entry per line,
 * with line N of one language translating line N of the other.
 */
export const splitLines = (value) => (value ? String(value).split('\n') : []);

/** Pair the English and Nepali lines into `{ en, ne }` entries. */
export function bookEntries(en, ne) {
  const enLines = splitLines(en);
  const neLines = splitLines(ne);
  return Array.from({ length: Math.max(enLines.length, neLines.length) }, (_, index) => ({
    en: (enLines[index] || '').trim(),
    ne: (neLines[index] || '').trim(),
  })).filter((entry) => entry.en || entry.ne);
}

/** The reverse of `bookEntries`: a language nobody wrote in stays empty. */
export function joinEntries(entries) {
  const kept = entries
    .map((entry) => ({ en: entry.en.trim(), ne: entry.ne.trim() }))
    .filter((entry) => entry.en || entry.ne);
  const join = (key) => (kept.some((entry) => entry[key]) ? kept.map((entry) => entry[key]).join('\n') : '');
  return { en: join('en'), ne: join('ne') };
}

/** One entry prints as plain text, several as a list. */
function EntryList({ items, numbered = false, number = (value) => String(value) }) {
  if (items.length === 1) return items[0];
  if (numbered) {
    return (
      <ol className="cas-book-indicators cas-book-entries cas-book-numbered-entries">
        {items.map((item, index) => (
          <li key={index}>
            <span className="cas-book-entry-marker">{number(index + 1)}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="cas-book-indicators cas-book-entries">
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  );
}

const pickEntries = (en, ne, pick) =>
  bookEntries(en, ne).map((entry) => pick(entry.en, entry.ne)).filter(Boolean);

/**
 * The "Assessment areas" cell in the display language. When the school has
 * written none, the book prints the outcome's level descriptors, else its
 * indicators.
 */
export function AssessmentAreaCell({ row, label, number, pick }) {
  const aspects = pickEntries(row.assessmentAspect, row.assessmentAspectNe, pick);
  if (aspects.length) return <EntryList items={aspects} numbered number={number} />;
  if (row.descriptors?.length) {
    return (
      <ul className="cas-book-indicators">
        {row.descriptors.map((descriptor) => (
          <li key={descriptor.level}>
            {number(descriptor.level)}.{' '}
            {label(
              descriptor.textEn || descriptor.textNe,
              descriptor.textNe || descriptor.textEn,
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (row.indicators?.length) {
    return (
      <ul className="cas-book-indicators">
        {row.indicators.map((indicator, index) => (
          <li key={index}>
            {number(index + 1)}.{' '}
            {label(
              indicator.textEn || indicator.textNe,
              indicator.textNe || indicator.textEn,
            )}
          </li>
        ))}
      </ul>
    );
  }
  return '—';
}

/** The "Tools" cell: the school's tools, else the ones on each indicator. */
export function ToolsCell({ row, pick }) {
  const tools = pickEntries(row.assessmentTool, row.assessmentToolNe, pick);
  if (!tools.length) {
    tools.push(...new Set((row.indicators || []).map((indicator) => indicator.tool).filter(Boolean)));
  }
  return tools.length ? <EntryList items={tools} /> : '—';
}
