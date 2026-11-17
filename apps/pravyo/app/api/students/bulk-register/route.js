import connectDB from "../../../../lib/db.js";
import Student from "../../../../models/Student.js";
import AcademicYear from "../../../../models/AcademicYear.js";
import SchoolConfig from "../../../../models/SchoolConfig.js";
import { resolveStudentSection } from "../../../../lib/gradeSections.js";
import { successResponse, errorResponse } from "../../../../lib/apiResponse.js";
import {
  generatePlatformStudentId,
  generateUniqueStudentUsername,
} from "../../../../lib/studentIdentity.js";
import { normalizeGradeValue } from "../../../../lib/schoolGrades.js";
import {
  getSessionSchoolId,
  isActiveStudentQuery,
  requireApiSession,
} from "../../../../lib/authz.js";
import {
  ensureActiveAcademicYear,
  makeEnrollmentEntry,
} from "../../../../lib/studentEnrollment.js";
import bcrypt from "bcryptjs";
import { DEFAULT_STUDENT_PASSWORD } from "../../../../lib/passwordGenerator.js";
import { linkGuardianFromStudentRecord } from "../../../../lib/guardianLinking.js";
import { checkStudentIemis } from "@/lib/iemisRegistry";
import { OFF_ROSTER_STATUSES } from "@pravyo/db/studentStatus";

export async function POST(req) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;

    const schoolId = getSessionSchoolId(session);
    if (!schoolId) {
      return errorResponse(403, "Forbidden", "FORBIDDEN");
    }

    await connectDB();
    const { students } = await req.json();

    if (!students || !Array.isArray(students) || students.length === 0) {
      return errorResponse(400, "No students provided");
    }

    const results = {
      success: [],
      failed: [],
    };
    const reservedUsernames = new Set();
    const reservedRegistrations = new Set();
    const reservedIemis = new Set();
    const academicYear = await ensureActiveAcademicYear(schoolId);
    const schoolNameSnapshot =
      session.user.schoolName || session.user.name || "";
    const schoolConfig = await SchoolConfig.findOne({ school: schoolId }).select("gradeSections").lean();

    for (const studentData of students) {
      try {
        // Basic validation
        if (!studentData.firstName || !studentData.lastName || !studentData.grade || !studentData.rollNumber) {
          throw new Error("Missing required fields (First Name, Last Name, Grade, Roll Number)");
        }
        const normalizedRegistrationNumber = String(studentData.registrationNumber || "").trim();
        // Compulsory and unique, in the platform and within this file.
        const { iemisNumber: normalizedIemisNumber, error: iemisError } = await checkStudentIemis(studentData.iemisNumber);
        if (iemisError) throw new Error(iemisError);
        if (reservedIemis.has(normalizedIemisNumber)) {
          throw new Error(`Student IEMIS number ${normalizedIemisNumber} appears twice in this file`);
        }
        if (!normalizedRegistrationNumber) {
          throw new Error("Missing required field: Registration Number");
        }
        if (reservedRegistrations.has(normalizedRegistrationNumber)) {
          throw new Error(`Registration number ${normalizedRegistrationNumber} appears twice in this file`);
        }
        const existingRegistration = await Student.findOne({
          school: schoolId,
          registrationNumber: normalizedRegistrationNumber,
          isDeleted: { $ne: true },
        }).select("name").lean();
        if (existingRegistration) {
          throw new Error(
            `Registration number ${normalizedRegistrationNumber} already belongs to ${existingRegistration.name}`
          );
        }

        // Generate credentials
        const normalizedGrade = normalizeGradeValue(studentData.grade);
        const normalizedRollNumber = String(studentData.rollNumber).trim();
        const placement = resolveStudentSection(normalizedGrade, studentData.section, schoolConfig?.gradeSections || []);
        if (placement.error) throw new Error(placement.error);
        const username = await generateUniqueStudentUsername(Student, {
          firstName: studentData.firstName,
          grade: normalizedGrade,
          rollNumber: normalizedRollNumber,
          school: schoolId,
          reserved: reservedUsernames,
        });
        
        // Every student starts with the default password and changes it later.
        const plainPassword = DEFAULT_STUDENT_PASSWORD;
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Roll number is free if no on-roster student holds it (graduated/
        // transferred/inactive students release their roll number).
        const existingRollNumber = await Student.findOne({
          school: schoolId,
          grade: normalizedGrade,
          rollNumber: normalizedRollNumber,
          isDeleted: { $ne: true },
          status: { $nin: OFF_ROSTER_STATUSES },
        });

        if (existingRollNumber) {
          throw new Error(
            `Roll number ${normalizedRollNumber} already exists in ${normalizedGrade}`
          );
        }

        // Check for duplicate email (if provided)
        if (studentData.email) {
          const existingEmail = await Student.findOne(
            isActiveStudentQuery({ email: studentData.email })
          );
          if (existingEmail) {
            throw new Error(`Email ${studentData.email} is already registered`);
          }
        }

        const newStudent = new Student({
          ...studentData,
          platformStudentId: await generatePlatformStudentId(Student),
          name: `${studentData.firstName} ${studentData.lastName}`,
          username,
          password: hashedPassword,
          school: schoolId,
          grade: normalizedGrade,
          section: placement.section,
          rollNumber: normalizedRollNumber,
          registrationNumber: normalizedRegistrationNumber,
          iemisNumber: normalizedIemisNumber,
          status: "ACTIVE",
          email: studentData.email || undefined,
          // Set defaults for optional fields if missing
          guardianRelationship: studentData.guardianRelationship || "FATHER",
          parentName: studentData.parentName || "To be added",
          parentContactNumber: studentData.parentContactNumber || "To be added",
          parentEmail: studentData.parentEmail || undefined,
          enrollments: [
            makeEnrollmentEntry({
              school: schoolId,
              schoolName: schoolNameSnapshot,
              grade: normalizedGrade,
              rollNumber: normalizedRollNumber,
              section: placement.section,
              academicYear,
            }),
          ],
        });

        await newStudent.save();
        reservedRegistrations.add(normalizedRegistrationNumber);
        reservedIemis.add(normalizedIemisNumber);

        // The school named this parent on the registration sheet, so treat it
        // as an authentic guardian relationship and link it now. Never throws;
        // a guardian problem must not fail the student's registration.
        const guardian = await linkGuardianFromStudentRecord({
          student: newStudent,
          schoolId,
          actorId: session?.user?.id || null,
        });

        results.success.push({
          name: newStudent.name,
          username: newStudent.username,
          password: plainPassword,
          guardianLinked: guardian.linked,
        });

      } catch (error) {
        results.failed.push({
          student: studentData,
          reason: error.message,
        });
      }
    }

    if (academicYear?._id && results.success.length > 0) {
      await AcademicYear.updateOne(
        { _id: academicYear._id },
        { $inc: { "summary.admitted": results.success.length } }
      );
    }

    return successResponse(200, "Bulk registration completed", results);

  } catch (error) {
    console.error("Bulk registration error:", error);
    return errorResponse(500, "Internal server error");
  }
}
