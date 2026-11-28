import { requireApiSession } from "@/lib/authz";
import connectDB from "@/lib/db";
import SchoolConfig from "@/models/SchoolConfig";
import User from "@/models/User";
import Student from "@/models/Student";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import { gradesFromRecords } from "@/lib/schoolGradeConfig";
import { resolveSchoolGrades } from "@/lib/schoolGrades";
import {
  successResponse,
  errorResponse,
  unauthorizedError,
} from "@/lib/apiResponse";

export async function GET(req) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return unauthorizedError();
    }

    await connectDB();

    const user = await User.findById(session.user.id).select("schoolConfig");

    // The school's grades: its own list once edited, else the signup range
    // (kept in sync here). Never overwrites a school's edited list.
    let config = await SchoolConfig.findOne({ school: session.user.id });
    if (!config) {
      config = await SchoolConfig.create({
        school: session.user.id,
        grades: resolveSchoolGrades(user?.schoolConfig, null),
      });
    } else {
      await gradesFromRecords(user, config);
    }

    const [totalStudents, totalTeachers] = await Promise.all([
      Student.countDocuments({ school: session.user.id, isDeleted: { $ne: true } }),
      TeacherMembership.countDocuments({
        school: session.user.id,
        status: { $in: ["ACTIVE", "INACTIVE"] },
      }),
    ]);

    const payload = config.toObject();
    payload.totalStudents = totalStudents;
    payload.totalTeachers = totalTeachers;

    return successResponse(200, "Config retrieved", payload);
  } catch (error) {
    console.error("Get Config Error:", error);
    return errorResponse(500, "Error fetching config");
  }
}

export async function PUT(req) {
  try {
    const { session, error: authError } = await requireApiSession();
    if (authError) return authError;
    if (!session || session.user.role !== "SCHOOL_ADMIN") {
      return unauthorizedError();
    }

    const body = await req.json();
    const {
      schoolName,
      schoolCode,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      principalName,
    } = body;

    await connectDB();

    const updateData = {};
    if (schoolName !== undefined) updateData.schoolName = schoolName;
    if (schoolCode !== undefined) updateData.schoolCode = schoolCode;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (principalName !== undefined) updateData.principalName = principalName;

    const config = await SchoolConfig.findOneAndUpdate(
      { school: session.user.id },
      updateData,
      { new: true, upsert: true }
    );

    return successResponse(200, "Config updated successfully", config);
  } catch (error) {
    console.error("Update Config Error:", error);
    return errorResponse(500, "Error updating config");
  }
}
