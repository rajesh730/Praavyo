import { NextResponse } from 'next/server';
import { requireApiSession } from "@/lib/authz";
import connectDB from '@/lib/db';
import User from '@/models/User';
import { publishWorkIndicatorsUpdate } from '@/lib/workIndicatorRealtime';
import { sendSchoolApprovalEmail } from '@/lib/emailService';
import { provisionDefaultCurriculum } from '@pravyo/cas/lib/casLibraryService';

export async function PUT(req, { params }) {
    try {
        const { session, error: authError } = await requireApiSession();
        if (authError) return authError;

        if (!session || session.user.role !== 'SUPER_ADMIN') {
            console.error("❌ Unauthorized - User is not SUPER_ADMIN");
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        // Await params for Next.js 15+
        const { id } = await params;
        const { status } = await req.json();

        if (!['PENDING', 'APPROVED', 'REJECTED', 'SUBSCRIBED', 'UNSUBSCRIBED'].includes(status)) {
            console.error("❌ Invalid status:", status);
            return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
        }

        await connectDB();

        const previous = await User.findById(id).select('status email schoolName').lean();
        if (!previous) {
            console.error("❌ School not found with ID:", id);
            return NextResponse.json({ message: 'School not found' }, { status: 404 });
        }

        const user = await User.findByIdAndUpdate(id, { status }, { new: true });

        // Welcome email only when the school newly gains access; failures are
        // logged inside sendSchoolApprovalEmail and never block the update.
        const hadAccess = ['APPROVED', 'SUBSCRIBED'].includes(previous.status);
        const hasAccess = ['APPROVED', 'SUBSCRIBED'].includes(status);
        if (!hadAccess && hasAccess && previous.email) {
            sendSchoolApprovalEmail(previous.email, previous.schoolName || 'Your school');
        }
        if (!hadAccess && hasAccess) {
            await giveDefaultCurriculum(id, session.user.id);
        }

        publishWorkIndicatorsUpdate("school-status-updated", {
            schoolId: String(user._id),
            status: user.status,
        });
        return NextResponse.json({ message: 'Status updated', user }, { status: 200 });
    } catch (error) {
        console.error('❌ Error updating status:', error.message);
        return NextResponse.json({ message: 'Error updating status', error: error.message }, { status: 500 });
    }
}

/**
 * Copy the default CAS curriculum (Grades 1–5) into a newly approved school.
 *
 * Only library subjects the school has not received before are copied, so a
 * re-approval or double-click never duplicates, and a subject the school
 * deleted never returns. A failure never blocks the approval itself; the
 * backfill script (npm run provision:curriculum) completes it later.
 */
async function giveDefaultCurriculum(schoolId, approvedBy) {
    try {
        const school = await User.findOne({ _id: schoolId, role: 'SCHOOL_ADMIN' }).select('casDefaultSubjects').lean();
        if (!school) return;
        const result = await provisionDefaultCurriculum(schoolId, {
            createdBy: approvedBy || null,
            received: school.casDefaultSubjects || [],
        });
        if (result.copied.length) {
            await User.updateOne({ _id: schoolId }, { $addToSet: { casDefaultSubjects: { $each: result.copied } } });
        }
        if (result.error) throw result.error;
        console.info('[cas] default curriculum for school', String(schoolId),
            { subjects: result.subjects, themes: result.themes, outcomes: result.outcomes, skippedGrades: result.skippedGrades });
    } catch (error) {
        console.error('[cas] default curriculum copy failed for school', String(schoolId), error.message);
    }
}
