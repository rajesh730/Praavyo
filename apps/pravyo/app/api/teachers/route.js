import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/routeHandler";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import SchoolConfig from "@/models/SchoolConfig";
import { backfillTeacherMemberships } from "@pravyo/db/teacherMemberships";
import { buildPagination, escapeRegex, parsePagination } from "@/lib/pagination";

const STATUS_FILTERS = {
  CURRENT: ["ACTIVE", "INACTIVE"],
  ACTIVE: ["ACTIVE"],
  INACTIVE: ["INACTIVE"],
  LEFT: ["LEFT"],
  ALL: ["ACTIVE", "INACTIVE", "LEFT"],
};
const RESPONSIBILITIES = ["CLASS_TEACHER", "SUBJECT_TEACHER", "UNASSIGNED"];
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT"];
const subjectTitle = (subject) => subject.titleEn || subject.titleNe || subject.code;

/**
 * The school's teachers: everyone with a membership here, whichever school
 * created their account. Registration lives in ./register, everything about one
 * teacher in ./[id].
 *
 * Optional filters: grade, responsibility (CLASS_TEACHER / SUBJECT_TEACHER /
 * UNASSIGNED), subject (a title, so "English" matches every grade's English)
 * and employment. A teacher who left is matched on the assignments
 * snapshotted when they left, which is what their row shows.
 */
export const GET = defineRoute({ roles: ["SCHOOL_ADMIN"] }, async ({ request, session }) => {
  const school = session.user.id;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim();
  const statuses = STATUS_FILTERS[String(searchParams.get("status") || "CURRENT").toUpperCase()] || STATUS_FILTERS.CURRENT;
  const grade = (searchParams.get("grade") || "").trim();
  const responsibility = RESPONSIBILITIES.find((value) => value === searchParams.get("responsibility")) || "";
  const subjectFilter = (searchParams.get("subject") || "").trim().toLowerCase();
  const employment = EMPLOYMENT_TYPES.find((value) => value === searchParams.get("employment")) || "";
  const { page, limit, skip } = parsePagination(searchParams, { limit: 20, maxLimit: 200 });

  await backfillTeacherMemberships({ school });

  const [memberships, config, schoolSubjects, schoolAssignments] = await Promise.all([
    TeacherMembership.find({ school }).lean(),
    SchoolConfig.findOne({ school }).select("grades").lean(),
    CasSubject.find({ school }).select("grade code titleEn titleNe status").lean(),
    TeacherTeachingAssignment.find({ school }).lean(),
  ]);
  const counts = { ACTIVE: 0, INACTIVE: 0, LEFT: 0 };
  memberships.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1; });
  const membershipByTeacher = new Map(memberships.map((row) => [String(row.teacher), row]));
  const subjectById = new Map(schoolSubjects.map((subject) => [String(subject._id), subject]));

  // Each teacher's responsibilities as { grade, assignmentType, subject title }.
  const responsibilitiesOf = (membership) => (membership.status === "LEFT"
    ? (membership.endedAssignments || []).map((row) => ({ grade: row.grade, assignmentType: row.assignmentType, subject: row.subjectTitle || "" }))
    : schoolAssignments
      .filter((row) => String(row.teacher) === String(membership.teacher))
      .map((row) => {
        const subject = row.subject ? subjectById.get(String(row.subject)) : null;
        return { grade: row.grade, assignmentType: row.assignmentType, subject: subject ? subjectTitle(subject) : "" };
      }));

  const matches = (membership) => {
    if (!statuses.includes(membership.status)) return false;
    if (employment && (membership.employmentType || "FULL_TIME") !== employment) return false;
    const rows = responsibilitiesOf(membership).filter((row) => !grade || row.grade === grade);
    if (responsibility === "UNASSIGNED") return rows.length === 0;
    return (!grade && !responsibility && !subjectFilter) || rows.some((row) =>
      (!responsibility || row.assignmentType === responsibility)
      && (!subjectFilter || (row.assignmentType === "SUBJECT_TEACHER" && row.subject.toLowerCase() === subjectFilter)));
  };

  const query = {
    _id: { $in: memberships.filter(matches).map((row) => row.teacher) },
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
  const elsewhere = await TeacherMembership.distinct("teacher", {
    teacher: { $in: teacherIds }, school: { $ne: school }, status: { $in: ["ACTIVE", "INACTIVE"] },
  });
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
      assignments: schoolAssignments
        .filter((row) => String(row.teacher) === String(teacher._id))
        .map((row) => {
          const subject = row.subject ? subjectById.get(String(row.subject)) : null;
          return {
            grade: row.grade,
            assignmentType: row.assignmentType,
            subject: subject ? subjectTitle(subject) : null,
          };
        }),
      endedAssignments: membership.endedAssignments || [],
    };
  });

  // Top-level keys (not the data envelope): the event screens read `teachers`.
  return NextResponse.json({
    teachers: rows,
    counts,
    // Choices for the Teacher section's filters: every grade, and each active
    // subject title with the grades it is taught in.
    filterOptions: {
      grades: config?.grades || [],
      subjects: Object.values(schoolSubjects
        .filter((subject) => subject.status === "ACTIVE")
        .reduce((acc, subject) => {
          const title = subjectTitle(subject);
          const entry = acc[title.toLowerCase()] || { title, grades: [] };
          if (!entry.grades.includes(subject.grade)) entry.grades.push(subject.grade);
          return { ...acc, [title.toLowerCase()]: entry };
        }, {}))
        .sort((a, b) => a.title.localeCompare(b.title)),
    },
    pagination: { ...buildPagination({ page, limit, total }), totalTeachers: total },
  });
});
