import { createHash } from 'node:crypto';

/**
 * Fingerprint of a theme's content, used to tell whether a school's copy and
 * the default library still match. Pure (no database), so the app and the
 * library set-up script compute exactly the same value.
 */

export function outcomeContent(row) {
  return {
    code: String(row.code || '').toUpperCase(),
    titleEn: row.titleEn || '',
    titleNe: row.titleNe || '',
    descriptors: (row.descriptors || []).map((d) => ({ level: d.level, textEn: d.textEn || '', textNe: d.textNe || '' })),
    indicators: (row.indicators || []).map((i) => ({ textEn: i.textEn || '', textNe: i.textNe || '', tool: i.tool || '' })),
    assessmentAspect: row.assessmentAspect || '',
    assessmentAspectNe: row.assessmentAspectNe || '',
    assessmentTool: row.assessmentTool || '',
    assessmentToolNe: row.assessmentToolNe || '',
  };
}

export const bySequence = (a, b) =>
  (a.sequence || 1) - (b.sequence || 1) || String(a.code).localeCompare(String(b.code));

export function themeHash(theme, outcomes) {
  const content = {
    titleEn: theme.titleEn || '',
    titleNe: theme.titleNe || '',
    workingHours: theme.workingHours ?? null,
    outcomes: [...outcomes].sort(bySequence).map(outcomeContent),
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 40);
}
