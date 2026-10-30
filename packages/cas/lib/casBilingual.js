const DEVANAGARI = /[ऀ-ॿ]/;

/**
 * An outcome's assessment area and tool, as an English/Nepali pair.
 *
 * These were once a single field holding whichever language the book printed
 * — "Listening" for English, "दृश्यबोध" for Nepali. Devanagari text found in
 * the English field with no Nepali value beside it is read as the Nepali
 * version, so the display-language switch shows it in the right place and the
 * next save stores it there.
 */
export function bilingualText(en = '', ne = '') {
  if (!ne && DEVANAGARI.test(en)) return { en: '', ne: en };
  return { en: en || '', ne: ne || '' };
}

export function assessmentColumns(outcome) {
  const aspect = bilingualText(outcome.assessmentAspect, outcome.assessmentAspectNe);
  const tool = bilingualText(outcome.assessmentTool, outcome.assessmentToolNe);
  return {
    assessmentAspect: aspect.en,
    assessmentAspectNe: aspect.ne,
    assessmentTool: tool.en,
    assessmentToolNe: tool.ne,
  };
}
