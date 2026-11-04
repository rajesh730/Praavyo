import { handler } from '@pravyo/cas/lib/casRoute';
import { loadSchool, loadAcademicYears } from '@pravyo/cas/lib/casContext';
import { syncDefaultCurriculum } from '@pravyo/cas/lib/casLibraryService';

export const dynamic = 'force-dynamic';

/**
 * Everything the shell needs on first paint: who the school is, its grades, and
 * its academic years. One request instead of three.
 */
export const GET = handler(async ({ actor }) => {
  // Library subjects added since the school was approved (a new grade) arrive here.
  if (!actor.library) await syncDefaultCurriculum(actor.school);

  const [school, years] = await Promise.all([
    loadSchool(actor),
    loadAcademicYears(actor),
  ]);

  // Default to the year the school is actually working in.
  const selectedYear = years.find((y) => y.status === 'ACTIVE') || years[0] || null;

  return {
    actor: { id: actor.id, school: actor.school, role: actor.role, name: actor.name, calendar: actor.calendar },
    school,
    years,
    selectedYear,
  };
});
