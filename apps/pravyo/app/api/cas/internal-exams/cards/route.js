import { handler } from '@pravyo/cas/lib/casRoute';
import { loadCards } from '@pravyo/cas/lib/internalExamService';
import { withBranding } from '@pravyo/cas/lib/casBranding';

export const dynamic = 'force-dynamic';

export const GET = handler(async ({ actor, query }) => withBranding(actor.school, await loadCards(actor, {
  exam: query.get('exam') || '',
  section: query.get('section') || '',
})));
