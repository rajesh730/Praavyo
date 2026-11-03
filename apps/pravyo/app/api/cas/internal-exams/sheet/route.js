import { handler } from '@pravyo/cas/lib/casRoute';
import { loadSheet } from '@pravyo/cas/lib/internalExamService';

export const dynamic = 'force-dynamic';

export const GET = handler(({ actor, query }) => loadSheet(actor, {
  exam: query.get('exam') || '',
  section: query.get('section') || '',
}));
