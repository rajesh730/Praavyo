import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import Feedback from "@/models/Feedback";
import Student from "@/models/Student";
import User from "@/models/User";
import Teacher from "@/models/Teacher";
import { isActiveTeacherMember } from "@pravyo/db/teacherMemberships";
import { publishWorkIndicatorsUpdate } from "@/lib/workIndicatorRealtime";
import { buildStudentLookupForSession } from "@/lib/studentIdentity";
import { requireParentChild, requireParentSession } from "@/lib/parentAccess";

function clean(value) {
  return String(value || "").trim();
}

function serializeFeedback(feedback) {
  return {
    id: String(feedback._id),
    submitterRole: feedback.submitterRole,
    recipient: feedback.recipient || "PLATFORM",
    aboutStudentName: feedback.aboutStudentName || "",
    grade: feedback.grade || "",
    submitterName: feedback.submitterName,
    submitterEmail: feedback.submitterEmail,
    schoolName: feedback.schoolName,
    type: feedback.type,
    rating: feedback.rating,
    title: feedback.title,
    message: feedback.message,
    status: feedback.status,
    createdAt: feedback.createdAt,
    reviewedAt: feedback.reviewedAt,
  };
}

async function getStudentProfile(session) {
  return Student.findOne({
    ...buildStudentLookupForSession(session),
  })
    .populate("school", "schoolName email")
    .lean();
}

export async function GET(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = clean(searchParams.get("status")).toUpperCase();
    const role = clean(searchParams.get("role")).toUpperCase();
    const query = {};

    if (session.user.role === "SUPER_ADMIN") {
      // Praavyo reads feedback meant for the platform, not schools' inboxes.
      query.recipient = { $ne: "SCHOOL" };
      if (["NEW", "REVIEWED", "ARCHIVED"].includes(status)) query.status = status;
      if (["SCHOOL_ADMIN", "STUDENT"].includes(role)) query.submitterRole = role;
    } else if (session.user.role === "SCHOOL_ADMIN") {
      if (clean(searchParams.get("scope")).toLowerCase() === "inbox") {
        // The school's inbox: everything its students, parents and teachers sent.
        query.school = session.user.id;
        query.submitterRole = { $in: ["STUDENT", "PARENT", "TEACHER"] };
        if (["NEW", "REVIEWED", "ARCHIVED"].includes(status)) query.status = status;
        if (["STUDENT", "PARENT", "TEACHER"].includes(role)) query.submitterRole = role;
      } else {
        // What the school itself sent to Praavyo.
        query.submittedBy = session.user.id;
        query.submitterModel = "User";
      }
    } else if (session.user.role === "PARENT") {
      const { parent, error: parentError } = await requireParentSession();
      if (parentError) return parentError;
      query.submittedBy = parent._id;
      query.submitterModel = "Parent";
    } else if (session.user.role === "TEACHER") {
      // What the teacher sent to the school they are working in now.
      if (!session.user.schoolId) return NextResponse.json({ feedback: [] });
      query.submittedBy = session.user.id;
      query.submitterModel = "Teacher";
      query.school = session.user.schoolId;
    } else if (session.user.role === "STUDENT") {
      const student = await getStudentProfile(session);
      if (!student) {
        return NextResponse.json({ feedback: [] });
      }
      query.submittedBy = student._id;
      query.submitterModel = "Student";
    } else {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return NextResponse.json({ feedback: feedback.map(serializeFeedback) });
  } catch (error) {
    console.error("GET /api/feedback error:", error);
    return NextResponse.json(
      { message: "Failed to load feedback" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || !["SCHOOL_ADMIN", "STUDENT", "PARENT", "TEACHER"].includes(session.user.role)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const title = clean(body.title);
    const message = clean(body.message);
    const type = clean(body.type).toUpperCase() || "GENERAL";
    const rating = Number(body.rating) || null;

    if (!title || !message) {
      return NextResponse.json(
        { message: "Title and feedback message are required." },
        { status: 400 }
      );
    }

    if (!["GENERAL", "BUG", "SUGGESTION", "EXPERIENCE"].includes(type)) {
      return NextResponse.json(
        { message: "Invalid feedback type." },
        { status: 400 }
      );
    }

    if (rating !== null && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { message: "Rating must be between 1 and 5." },
        { status: 400 }
      );
    }

    let payload;
    if (session.user.role === "STUDENT") {
      const student = await getStudentProfile(session);
      if (!student) {
        return NextResponse.json(
          { message: "Student profile not found." },
          { status: 404 }
        );
      }
      // A student's feedback goes to their school.
      payload = {
        submittedBy: student._id,
        submitterModel: "Student",
        submitterRole: "STUDENT",
        submitterName: student.name || session.user.name || "",
        submitterEmail: student.email || session.user.email || "",
        school: student.school?._id || student.school || null,
        schoolName: student.school?.schoolName || "",
        recipient: "SCHOOL",
        grade: student.grade || "",
      };
    } else if (session.user.role === "PARENT") {
      // A parent's feedback goes to the school of the child it is about.
      const access = await requireParentChild(body.studentId);
      if (access.error) return access.error;
      const child = access.student;
      const school = await User.findById(child.school).select("schoolName").lean();
      payload = {
        submittedBy: access.parent?._id || session.user.id,
        submitterModel: "Parent",
        submitterRole: "PARENT",
        submitterName: access.parent?.name || session.user.name || "",
        submitterEmail: access.parent?.email || session.user.email || "",
        school: child.school || null,
        schoolName: school?.schoolName || "",
        recipient: "SCHOOL",
        aboutStudent: child._id,
        aboutStudentName: child.name || "",
        grade: child.grade || "",
      };
    } else if (session.user.role === "TEACHER") {
      // A teacher's feedback goes to the school they are working in now.
      // Access follows TeacherMembership, never Teacher.school.
      const schoolId = session.user.schoolId;
      if (!schoolId) {
        return NextResponse.json(
          { message: "Choose the school you are working in first." },
          { status: 409 }
        );
      }
      if (!(await isActiveTeacherMember(session.user.id, schoolId))) {
        return NextResponse.json(
          { message: "You no longer have access to this school." },
          { status: 403 }
        );
      }
      const [teacher, school] = await Promise.all([
        Teacher.findById(session.user.id).select("name email").lean(),
        User.findById(schoolId).select("schoolName").lean(),
      ]);
      payload = {
        submittedBy: session.user.id,
        submitterModel: "Teacher",
        submitterRole: "TEACHER",
        submitterName: teacher?.name || session.user.name || "",
        submitterEmail: teacher?.email || session.user.email || "",
        school: schoolId,
        schoolName: school?.schoolName || session.user.schoolName || "",
        recipient: "SCHOOL",
      };
    } else {
      const school = await User.findById(session.user.id)
        .select("schoolName email")
        .lean();
      payload = {
        submittedBy: session.user.id,
        submitterModel: "User",
        submitterRole: "SCHOOL_ADMIN",
        submitterName: school?.schoolName || session.user.name || "",
        submitterEmail: school?.email || session.user.email || "",
        school: session.user.id,
        schoolName: school?.schoolName || session.user.name || "",
        recipient: "PLATFORM",
      };
    }

    const feedback = await Feedback.create({
      ...payload,
      type,
      rating,
      title,
      message,
    });

    publishWorkIndicatorsUpdate("feedback-created", {
      feedbackId: String(feedback._id),
      submitterRole: feedback.submitterRole,
    });

    return NextResponse.json(
      {
        message:
          payload.recipient === "SCHOOL"
            ? `Feedback sent to ${payload.schoolName || "your school"}. Thank you.`
            : "Feedback submitted. Thank you for helping improve Praavyo.",
        feedback: serializeFeedback(feedback),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/feedback error:", error);
    return NextResponse.json(
      { message: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
