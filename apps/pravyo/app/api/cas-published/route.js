import { publishedCas } from '@/lib/casPublished';
export const dynamic = 'force-dynamic';
export async function GET(request) { try { return await publishedCas(request); } catch { return Response.json({ error: 'Unable to load results' }, { status: 500 }); } }
