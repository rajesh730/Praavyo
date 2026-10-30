export function normalizeGradeSections(input, grades = []) {
  const allowed = new Set(grades.map((grade) => String(grade).trim()));
  if (!Array.isArray(input)) throw new Error('Sections must be provided by grade.');
  return input.map((entry) => {
    const grade = String(entry?.grade || '').trim();
    if (!allowed.has(grade)) throw new Error(`Grade ${grade || '(blank)'} is not configured for this school.`);
    const sections = [...new Map((Array.isArray(entry.sections) ? entry.sections : [])
      .map((value) => String(value).trim()).filter(Boolean).map((name) => [name.toLocaleLowerCase(), name])).values()];
    if (sections.some((name) => name.length > 40)) throw new Error('Section names may not exceed 40 characters.');
    return { grade, sections };
  });
}

/**
 * Place a student in one of the sections configured for their grade.
 * A grade with sections requires one; a grade without sections takes none.
 * Returns the configured spelling, or an error message.
 */
export function resolveStudentSection(grade, section, gradeSections = []) {
  const options = (gradeSections || []).find((entry) => entry.grade === grade)?.sections || [];
  const value = String(section || '').trim();
  if (!options.length) {
    return value ? { error: `${grade} has no sections configured. Leave the section blank.` } : { section: '' };
  }
  const match = options.find((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase());
  return match ? { section: match } : { error: `Choose a section for ${grade}: ${options.join(', ')}.` };
}

export function sectionIsValid(grade, section, gradeSections = []) {
  const value = String(section || '').trim();
  return !value || Boolean(gradeSections.find((entry) => entry.grade === grade)?.sections
    .some((candidate) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()));
}
