import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/db';
import { requireParentChild } from '@/lib/parentAccess';
import Student from '@/models/Student';
// Read the same CAS collection; never copy results into the main application.
export async function publishedCas(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  let student, school;
  if (session.user.role === 'PARENT') {
    const childId = query.get('studentId');
    if (!mongoose.isValidObjectId(childId)) return Response.json({ error: 'Select a child' }, { status: 400 });
    const access = await requireParentChild(childId, 'canViewPortfolio');
    if (access.error) return access.error;
    if ((access.parent.authVersion || 0) !== (session.user.authVersion || 0)) return Response.json({ error: 'Session revoked' }, { status: 401 });
    student = access.student._id;
    school = access.link.school;
  } else if (session.user.role === 'STUDENT') {
    await connectDB();
    const row = await Student.findOne({ _id: session.user.id, status: 'ACTIVE', isDeleted: { $ne: true } }).select('_id').lean();
    if (!row) return Response.json({ error: 'Student access unavailable' }, { status: 403 });
    student = row._id;
  } else return Response.json({ error: 'Student or parent access required' }, { status: 403 });
  await connectDB();
  const filter = { student: new mongoose.Types.ObjectId(student), status: 'PUBLISHED', ...(school ? { school: new mongoose.Types.ObjectId(school) } : {}) };
  const reportId = query.get('report');
  if (reportId) {
    if (!mongoose.isValidObjectId(reportId)) return Response.json({ error: 'Invalid report' }, { status: 400 });
    filter._id = new mongoose.Types.ObjectId(reportId);
  }
  const rows = await mongoose.connection.db.collection('casreports').find(filter, { projection: reportId
    ? { snapshot: 1, comment: 1, status: 1, publishedAt: 1 }
    : { 'snapshot.year': 1, 'snapshot.period.title': 1, 'snapshot.membership.name': 1, 'snapshot.membership.grade': 1, publishedAt: 1 } })
    .sort({ publishedAt: -1 }).limit(100).toArray();
  if (reportId && !rows.length) return Response.json({ error: 'Report unavailable' }, { status: 404 });
  return Response.json({ data: reportId ? rows[0] : rows }, { headers: { 'Cache-Control': 'private, no-store' } });
}
