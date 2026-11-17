import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/db';
import { requireParentChild } from '@/lib/parentAccess';
import Student from '@/models/Student';
import { withBranding } from '@pravyo/cas/lib/casBranding';

// Read the same CAS collection; never copy results into the main application.
export async function publishedCas(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.error) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  // Results belong to the student, not to a school: a transferred child keeps
  // every result an earlier school published, as Student.enrollments does.
  let student;
  if (session.user.role === 'PARENT') {
    const childId = query.get('studentId');
    if (!mongoose.isValidObjectId(childId)) return Response.json({ error: 'Select a child' }, { status: 400 });
    const access = await requireParentChild(childId, 'canViewPortfolio');
    if (access.error) return access.error;
    if ((access.parent.authVersion || 0) !== (session.user.authVersion || 0)) return Response.json({ error: 'Session revoked' }, { status: 401 });
    student = access.student._id;
  } else if (session.user.role === 'STUDENT') {
    await connectDB();
    const row = await Student.findOne({ _id: session.user.id, status: 'ACTIVE', isDeleted: { $ne: true } }).select('_id').lean();
    if (!row) return Response.json({ error: 'Student access unavailable' }, { status: 403 });
    student = row._id;
  } else return Response.json({ error: 'Student or parent access required' }, { status: 403 });
  await connectDB();
  const now = new Date();
  const filter = {
    student: new mongoose.Types.ObjectId(student),
    status: 'PUBLISHED',
    $or: [{ publishedAt: { $lte: now } }, { publishedAt: null }, { publishedAt: { $exists: false } }],
  };
  const reportId = query.get('report');
  if (reportId) {
    if (!mongoose.isValidObjectId(reportId)) return Response.json({ error: 'Invalid report' }, { status: 400 });
    filter._id = new mongoose.Types.ObjectId(reportId);
  }
  // Two kinds of card: CAS (casreports, Grades 1–5) and the school's internal
  // exams (internalexamreports, Grades 1–10). `kind` tells the reader which
  // layout draws it.
  const sources = [
    { kind: 'CAS', collection: 'casreports' },
    { kind: 'INTERNAL', collection: 'internalexamreports' },
  ];
  const projection = reportId
    ? { snapshot: 1, format: 1, status: 1, publishedAt: 1, school: 1, student: 1 }
    // The list view needs only enough to render a link, so the full
    // per-outcome detail is not shipped to the browser until a report is opened.
    : { 'snapshot.academicYear.label': 1, 'snapshot.examTitle': 1, 'snapshot.student.name': 1,
        'snapshot.student.grade': 1, 'snapshot.total.achievement': 1, examTerm: 1, format: 1, publishedAt: 1 };
  const found = await Promise.all(sources.map(async ({ kind, collection }) => {
    const list = await mongoose.connection.db.collection(collection).find(filter, { projection })
      .sort({ publishedAt: -1 }).limit(100).toArray();
    return list.map((row) => ({ ...row, kind }));
  }));
  const rows = found.flat()
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, 100);
  if (reportId && !rows.length) return Response.json({ error: 'Report unavailable' }, { status: 404 });
  // The school that published the card supplies its header images.
  const data = reportId ? (await withBranding(rows[0].school, rows))[0] : rows;
  return Response.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

