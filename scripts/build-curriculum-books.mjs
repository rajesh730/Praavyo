/**
 * Turn the transcribed assessment books into curriculum JSON.
 *
 * Usage:
 *   node scripts/build-curriculum-books.mjs
 *
 * Reads every data/curriculum/books/grade-N-<subject>.txt and writes one
 * data/curriculum/books/grade-N.json per grade. Fails if any theme's row count
 * differs from the count printed in the book, so a dropped row cannot slip in.
 *
 * Text format, one subject per file:
 *
 *   @grade Grade 1
 *   @subject NEP | Nepali | मेरो नेपाली | 5          code | English | Nepali | credit hours
 *   @source ...                                       free text, kept in the JSON
 *   @note ...                                         free text, kept in the JSON
 *
 *   # 1 | म र मेरो परिवार | Me and My Family | 15 | 8
 *        sequence | Nepali title | English title | working hours | printed row count
 *
 *   @area Listening        assessment area for the outcomes that follow (reset per theme)
 *   - [key] outcome text   a learning outcome; [key] is optional
 *     area :: tool         one assessment-area/tool pair; either side may be empty
 *     4) level text        the book's indicator for achievement level 4 (down to 1)
 *   - [key]                repeats an outcome defined earlier, with its pairs,
 *                          unless pair lines follow, which replace them
 *
 * Text may carry both languages as "नेपाली || English". Otherwise Devanagari
 * text is Nepali and anything else English.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('data/curriculum/books');
const DEVANAGARI = /[ऀ-ॿ]/;

function bilingual(text) {
  const value = (text || '').trim();
  if (value.includes('||')) {
    const [ne, en] = value.split('||').map((part) => part.trim());
    return { en, ne };
  }
  return DEVANAGARI.test(value) ? { en: '', ne: value } : { en: value, ne: '' };
}

/** Parallel area/tool lists: line N of each belongs to pair N. */
function columns(pairs) {
  const area = pairs.map((pair) => bilingual(pair.area));
  const tool = pairs.map((pair) => bilingual(pair.tool));
  const join = (list, key) => (list.some((item) => item[key]) ? list.map((item) => item[key]).join('\n') : '');
  return {
    assessmentAspect: join(area, 'en'),
    assessmentAspectNe: join(area, 'ne'),
    assessmentTool: join(tool, 'en'),
    assessmentToolNe: join(tool, 'ne'),
  };
}

function parse(file, source) {
  const subject = { themes: [] };
  const keyed = new Map();
  let grade = null;
  let theme = null;
  let outcome = null;
  let area = '';
  const fail = (lineNo, message) => { throw new Error(`${file}:${lineNo}: ${message}`); };

  source.split(/\r?\n/).forEach((raw, index) => {
    const lineNo = index + 1;
    const line = raw.trimEnd();
    if (!line.trim()) return;
    if (line.startsWith('@grade ')) { grade = line.slice(7).trim(); return; }
    if (line.startsWith('@subject ')) {
      const [code, titleEn, titleNe, credit] = line.slice(9).split('|').map((part) => part.trim());
      Object.assign(subject, { code, titleEn, titleNe, creditHours: credit ? Number(credit) : null });
      return;
    }
    if (line.startsWith('@source ')) { subject.source = line.slice(8).trim(); return; }
    if (line.startsWith('@note ')) { (subject.notes ||= []).push(line.slice(6).trim()); return; }
    if (line.startsWith('@area')) { area = line.slice(5).trim(); return; }
    if (line.startsWith('# ')) {
      const [sequence, titleNe, titleEn, hours, count] = line.slice(2).split('|').map((part) => part.trim());
      theme = {
        sequence: Number(sequence), titleNe, titleEn,
        workingHours: hours === '' ? null : Number(hours),
        printedCount: Number(count), outcomes: [],
      };
      if (!Number.isInteger(theme.sequence) || !Number.isInteger(theme.printedCount)) fail(lineNo, 'bad theme header');
      subject.themes.push(theme);
      area = '';
      outcome = null;
      return;
    }
    if (line.startsWith('- ')) {
      if (!theme) fail(lineNo, 'outcome before any theme');
      const match = line.slice(2).match(/^\[([\w-]+)\]\s*(.*)$/);
      const key = match?.[1];
      const text = match ? match[2] : line.slice(2);
      if (key && !text) {
        const base = keyed.get(key);
        if (!base) fail(lineNo, `unknown key [${key}]`);
        outcome = { text: base.text, pairs: [...base.pairs], descriptors: [...base.descriptors], reused: true };
      } else {
        outcome = { text, pairs: area ? [{ area, tool: '' }] : [], descriptors: [], fromArea: Boolean(area) };
        if (key) keyed.set(key, outcome);
      }
      theme.outcomes.push(outcome);
      return;
    }
    const level = line.match(/^\s+([1-4])\)\s+(.+)$/);
    if (level) {
      if (!outcome) fail(lineNo, 'indicator before any outcome');
      outcome.descriptors.push({ level: Number(level[1]), text: level[2] });
      return;
    }
    if (/^\s+\S/.test(line) && line.includes('::')) {
      if (!outcome) fail(lineNo, 'pair before any outcome');
      // Pairs written under a reused or @area outcome replace the inherited ones.
      if (outcome.reused || outcome.fromArea) {
        outcome.pairs = [];
        outcome.reused = false;
        outcome.fromArea = false;
      }
      const [pairArea, tool] = line.split('::').map((part) => part.trim());
      outcome.pairs.push({ area: pairArea, tool });
      return;
    }
    fail(lineNo, `unrecognised line: ${line.trim()}`);
  });

  if (!grade || !subject.code) throw new Error(`${file}: needs @grade and @subject`);
  for (const t of subject.themes) {
    for (const o of t.outcomes) {
      const levels = o.descriptors.map((d) => d.level).sort().join('');
      if (levels && levels !== '1234') fail(0, `theme ${t.sequence}: "${o.text.slice(0, 40)}" has indicator levels ${levels}`);
    }
    if (t.outcomes.length !== t.printedCount) {
      throw new Error(`${file}: theme ${t.sequence} (${t.titleEn || t.titleNe}) has ${t.outcomes.length} rows, book prints ${t.printedCount}`);
    }
  }
  return { grade, subject };
}

const files = (await readdir(DIR)).filter((name) => /^grade-\d+-.+\.txt$/.test(name)).sort();
const grades = new Map();
for (const file of files) {
  const { grade, subject } = parse(file, await readFile(path.join(DIR, file), 'utf8'));
  if (!grades.has(grade)) grades.set(grade, []);
  grades.get(grade).push({
    code: subject.code, titleEn: subject.titleEn, titleNe: subject.titleNe,
    creditHours: subject.creditHours, source: subject.source, notes: subject.notes || [],
    themes: subject.themes.map((t) => ({
      sequence: t.sequence, titleEn: t.titleEn, titleNe: t.titleNe, workingHours: t.workingHours,
      outcomes: t.outcomes.map((o) => ({
        ...bilingualTitle(o.text),
        ...columns(o.pairs),
        descriptors: o.descriptors
          .map((d) => { const { en, ne } = bilingual(d.text); return { level: d.level, textEn: en, textNe: ne }; })
          .sort((a, b) => b.level - a.level),
      })),
    })),
  });
}

function bilingualTitle(text) {
  const { en, ne } = bilingual(text);
  return { titleEn: en, titleNe: ne };
}

for (const [grade, subjects] of grades) {
  const number = grade.match(/\d+/)[0];
  const out = path.join(DIR, `grade-${number}.json`);
  await writeFile(out, `${JSON.stringify({ grade, subjects }, null, 2)}\n`);
  console.log(grade);
  for (const s of subjects) {
    const rows = s.themes.reduce((sum, t) => sum + t.outcomes.length, 0);
    const hours = s.themes.reduce((sum, t) => sum + (t.workingHours || 0), 0);
    console.log(`  ${s.code.padEnd(5)} ${s.titleEn.padEnd(16)} ${String(s.themes.length).padStart(2)} themes ${String(rows).padStart(4)} outcomes ${String(hours).padStart(4)} hours`);
  }
}
