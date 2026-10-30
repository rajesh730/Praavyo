import { handler, jsonBody, HttpError } from '@pravyo/cas/lib/casRoute';
import {
  libraryOverview,
  linkLibrarySubject,
  addLibraryThemes,
  previewThemeUpdate,
  applyThemeUpdate,
} from '@pravyo/cas/lib/casLibraryService';

export const dynamic = 'force-dynamic';

/** Default theme library, from a school's side. */
export const GET = handler(({ actor, query }) => {
  const subject = query.get('subject');
  if (!subject) throw new HttpError('Choose a subject');
  return libraryOverview(actor, { subject });
});

/**
 * { action: 'link',    subject, librarySubject | null }
 * { action: 'add',     subject, themeKeys: [] }
 * { action: 'preview', subject, themeKey }
 * { action: 'update',  subject, themeKey }
 */
export const POST = handler(async ({ actor, request }) => {
  const body = await jsonBody(request);
  switch (body.action) {
    case 'link': return linkLibrarySubject(actor, body);
    case 'add': return addLibraryThemes(actor, body);
    case 'preview': return previewThemeUpdate(actor, body);
    case 'update': return applyThemeUpdate(actor, body);
    default: throw new HttpError('Unknown action');
  }
});
