import connectDB from "../../../../../lib/db";
import User from "../../../../../models/User";
import SchoolConfig from "../../../../../models/SchoolConfig";
import { successResponse, errorResponse } from "../../../../../lib/apiResponse";
import { resolveSchoolGrades } from "../../../../../lib/schoolGrades";
import { gradesFromRecords } from "../../../../../lib/schoolGradeConfig";
import {
  getSessionSchoolId,
  requireApiSession,
  sameId,
} from "../../../../../lib/authz";

export async function GET(req, { params }) {
  try {
    const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
    if (error) return error;

    await connectDB();
    const { id } = await params;
    const schoolId = getSessionSchoolId(session);

    if (!sameId(id, schoolId)) {
      return errorResponse(403, "Forbidden", "FORBIDDEN");
    }

    const school = await User.findById(id).select("schoolConfig educationLevels");

    if (!school) {
      return errorResponse(404, "School not found");
    }

    // Student registration's grade list: the school's current grades.
    let schoolConfigDoc = await SchoolConfig.findOne({ school: id });
    let grades;
    if (!schoolConfigDoc) {
      grades = resolveSchoolGrades(school.schoolConfig, null);
      schoolConfigDoc = await SchoolConfig.create({ school: id, grades });
    } else {
      grades = await gradesFromRecords(school, schoolConfigDoc);
    }

    return successResponse(200, "School config fetched", {
      grades,
      config: schoolConfigDoc,
    });
  } catch (error) {
    console.error("Error fetching school config:", error);
    return errorResponse(500, "Internal server error");
  }
}
