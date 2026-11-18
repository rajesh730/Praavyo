import { internalExamHandler } from '@/lib/exams/internalExamLock';
import { loadCards } from '@pravyo/cas/lib/internalExamService';
import { withBranding } from '@pravyo/cas/lib/casBranding';

export const dynamic = 'force-dynamic';

export const GET = internalExamHandler(async ({ actor, query }) => withBranding(actor.school, await loadCards(actor, {
  exam: query.get('exam') || '',
  section: query.get('section') || '',
})));
