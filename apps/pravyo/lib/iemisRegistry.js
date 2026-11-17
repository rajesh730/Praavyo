import Student from "@/models/Student";
import SchoolConfig from "@/models/SchoolConfig";
import { iemisNumberError, normalizeIemisNumber } from "@/lib/iemis";

/**
 * Server-side IEMIS rules (see lib/iemis.js for the format):
 *   - a student's IEMIS number is compulsory and unique across the platform,
 *     because the government issues one per student and it follows them
 *     between schools;
 *   - a school's IEMIS registration number is compulsory and unique across
 *     schools.
 * Each returns `{ iemisNumber, error }` with the normalised number.
 */
export async function checkStudentIemis(value, { exceptStudent = null } = {}) {
  const iemisNumber = normalizeIemisNumber(value);
  const error = iemisNumberError(iemisNumber, "Student IEMIS number");
  if (error) return { iemisNumber, error };
  const taken = await Student.findOne({
    iemisNumber,
    isDeleted: { $ne: true },
    ...(exceptStudent ? { _id: { $ne: exceptStudent } } : {}),
  }).select("name status transferOut.toSchoolName").lean();
  if (!taken) return { iemisNumber, error: "" };
  // A student transferred out keeps their record (and IEMIS number), so the
  // same child cannot be registered twice; say why, so the school knows.
  const takenError = taken.status === "TRANSFERRED_OUT"
    ? `Student IEMIS number ${iemisNumber} belongs to ${taken.name}, who was transferred out of another Praavyo school. Ask Praavyo support to move their record to your school.`
    : `Student IEMIS number ${iemisNumber} is already registered to ${taken.name}`;
  return { iemisNumber, error: takenError };
}

export async function checkSchoolIemis(value, { exceptSchool = null } = {}) {
  const iemisNumber = normalizeIemisNumber(value);
  const error = iemisNumberError(iemisNumber, "School IEMIS registration number");
  if (error) return { iemisNumber, error };
  const taken = await SchoolConfig.exists({
    iemisNumber,
    ...(exceptSchool ? { school: { $ne: exceptSchool } } : {}),
  });
  return taken
    ? { iemisNumber, error: `School IEMIS registration number ${iemisNumber} is already registered to another school` }
    : { iemisNumber, error: "" };
}
