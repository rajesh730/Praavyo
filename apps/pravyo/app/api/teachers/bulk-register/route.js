import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import bcrypt from "bcryptjs";
import { getSessionSchoolId, requireApiSession } from "@/lib/authz";
import { generateStrongPassword } from "@/lib/passwordGenerator";
import {
  assertEmailAvailable,
  assertUsernameAvailable,
  normalizeTeacherEmail,
  parseOptionalDate,
  resolveTeacherUsername,
} from "@/lib/teacherAccounts";

export async function POST(req) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;

    const schoolId = getSessionSchoolId(session);
    if (!schoolId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await connectDB();
    const { teachers } = await req.json();

    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
      return NextResponse.json(
        { message: "No teachers provided" },
        { status: 400 }
      );
    }

    const results = {
      success: [],
      failed: [],
    };

    for (const teacherData of teachers) {
      try {
        if (!teacherData.name || !teacherData.email) {
          throw new Error("Missing required fields (Name, Email)");
        }
        const normalizedEmail = normalizeTeacherEmail(teacherData.email);
        const dateOfJoining = parseOptionalDate(teacherData.dateOfJoining, "joining date");
        const membership = {
          designation: String(teacherData.designation || "").trim().slice(0, 80),
          dateOfJoining,
        };

        // Already on Pravyo (e.g. teaches at another school): add a membership
        // here and leave their login alone.
        const existingTeacher = await Teacher.findOne({ email: normalizedEmail }).select("name username").lean();
        if (existingTeacher) {
          const current = await TeacherMembership.findOne({ teacher: existingTeacher._id, school: schoolId }).select("status").lean();
          if (current) {
            throw new Error(current.status === "LEFT"
              ? `${existingTeacher.name} left your school earlier; use Rejoin in the Teacher section`
              : `${existingTeacher.name} is already a teacher at your school`);
          }
          await TeacherMembership.create({ teacher: existingTeacher._id, school: schoolId, status: "ACTIVE", addedBy: schoolId, ...membership });
          results.success.push({
            name: existingTeacher.name,
            email: normalizedEmail,
            username: existingTeacher.username || "",
            password: "(existing account — teacher keeps their password)",
          });
          continue;
        }

        const username = await resolveTeacherUsername({ username: teacherData.username, name: teacherData.name });
        await assertEmailAvailable(normalizedEmail);
        await assertUsernameAvailable(username);

        const plainPassword = teacherData.password || generateStrongPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        const newTeacher = await Teacher.create({
          name: teacherData.name,
          email: normalizedEmail,
          username,
          password: hashedPassword,
          phone: teacherData.phone,
          subject: teacherData.subject || "General",
          qualification: teacherData.qualification,
          gender: ["MALE", "FEMALE", "OTHER"].includes(String(teacherData.gender || "").toUpperCase())
            ? String(teacherData.gender).toUpperCase()
            : undefined,
          address: teacherData.address,
          dateOfJoining: dateOfJoining || undefined,
          designation: membership.designation,
          experience: teacherData.experience || undefined,
          bloodGroup: teacherData.bloodGroup || "",
          school: schoolId,
          roles: ["MENTOR"],
        });
        await TeacherMembership.create({ teacher: newTeacher._id, school: schoolId, status: "ACTIVE", addedBy: schoolId, ...membership });

        results.success.push({
          name: newTeacher.name,
          email: newTeacher.email,
          username: newTeacher.username,
          password: plainPassword,
        });
      } catch (error) {
        results.failed.push({
          teacher: teacherData,
          reason: error.message,
        });
      }
    }

    return NextResponse.json(
      {
        message: "Bulk registration completed",
        data: results
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Bulk teacher registration error:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 }
    );
  }
}
