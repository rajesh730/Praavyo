import TeacherMembership from "@pravyo/db/models/TeacherMembership";

/**
 * The teachers a school picked to manage one of its events, cut down to those
 * who are ACTIVE at that school right now.
 *
 * Stored in `Event.assignedMentors`, which `canManageEventRecord` and the round
 * routes already read. Anything else in the request — a teacher from another
 * school, one who has left, a malformed id — is dropped silently, so a stale
 * form can never hand an event to someone outside the school.
 */
export async function activeSchoolTeacherIds(ids, schoolId) {
  const wanted = [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id?._id || id || ""))
        .filter((id) => /^[a-f\d]{24}$/i.test(id))
    ),
  ];
  if (!wanted.length || !schoolId) return [];

  const rows = await TeacherMembership.find({
    school: schoolId,
    teacher: { $in: wanted },
    status: "ACTIVE",
  })
    .select("teacher")
    .lean();
  const active = new Set(rows.map((row) => String(row.teacher)));
  return wanted.filter((id) => active.has(id));
}
