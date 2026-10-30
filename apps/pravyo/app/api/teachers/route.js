import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import { backfillTeacherMemberships } from "@pravyo/db/teacherMemberships";
import { buildPagination, escapeRegex, parsePagination } from "@/lib/pagination";

const STATUS_FILTERS = {
  CURRENT: ["ACTIVE", "INACTIVE"],
  ACTIVE: ["ACTIVE"],
  INACTIVE: ["INACTIVE"],
  LEFT: ["LEFT"],
  ALL: ["ACTIVE", "INACTIVE", "LEFT"],
};

/**
 * The school's teachers: everyone with a membership here, whichever school
 * created their account. Registration lives in ./register, everything about one
 * teacher in ./[id].
 */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ request, session }) => {
  const school = session.user.id;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const statuses = STATUS_FILTERS[String(searchParams.get("status") || "CURRENT").toUpperCase()] || STATUS_FILTERS.CURRENT;
  const { page, limit, skip } = parsePagination(searchParams, { limit: 20, maxLimit: 200 });

  await backfillTeacherMemberships({ school });

  const memberships = await TeacherMembership.find({ school }).lean();
  const counts = { ACTIVE: 0, INACTIVE: 0, LEFT: 0 };
  memberships.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
  const membershipByTeacher = new Map(memberships.map((row) => [String(row.teacher), row]));

  const query = {
    _id: { $in: memberships.filter((row) => statuses.includes(row.status)).map((row) => row.teacher) },
  };
  if (search) {
    const safe = escapeRegex(search);
    query.$or = ["name", "email", "username", "phone", "subject"].map((field) => ({
      [field]: { $regex: safe, $options: "i" },
    }));
  }

  const [total, teachers] = await Promise.all([
    Teacher.countDocuments(query),
    Teacher.find(query)
      .select("name email username phone subject qualification createdAt")
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const teacherIds = teachers.map((teacher) => teacher._id);
  const [assignments, elsewhere] = await Promise.all([
    TeacherTeachingAssignment.find({ school, teacher: { $in: teacherIds } }).lean(),
    TeacherMembership.distinct("teacher", {
      teacher: { $in: teacherIds }, school: { $ne: school }, status: { $in: ["ACTIVE", "INACTIVE"] },
    }),
  ]);
  const subjectIds = assignments.map((row) => row.subject).filter(Boolean);
  const subjects = subjectIds.length
    ? await CasSubject.find({ _id: { $in: subjectIds }, school }).select("code titleEn titleNe").lean()
    : [];
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));
  const sharedIds = new Set(elsewhere.map(String));

  const rows = teachers.map((teacher) => {
    const membership = membershipByTeacher.get(String(teacher._id));
    return {
      _id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
      username: teacher.username || "",
      phone: teacher.phone || "",
      subject: teacher.subject || "",
      qualification: teacher.qualification || "",
      status: membership.status,
      designation: membership.designation || "",
      employmentType: membership.employmentType || "FULL_TIME",
      dateOfJoining: membership.dateOfJoining,
      leftAt: membership.leftAt,
      worksElsewhere: sharedIds.has(String(teacher._id)),
      assignments: assignments
        .filter((row) => String(row.teacher) === String(teacher._id))
        .map((row) => {
          const subject = row.subject ? subjectById.get(String(row.subject)) : null;
          return {
            grade: row.grade,
            assignmentType: row.assignmentType,
            subject: subject ? subject.titleEn || subject.titleNe || subject.code : null,
          };
        }),
      endedAssignments: membership.endedAssignments || [],
    };
  });

  // Top-level keys (not the data envelope): the event screens read `teachers`.
  return NextResponse.json({
    teachers: rows,
    counts,
    pagination: { ...buildPagination({ page, limit, total }), totalTeachers: total },
  });
});
