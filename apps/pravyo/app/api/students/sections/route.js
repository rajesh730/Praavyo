import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { getSessionSchoolId, requireApiSession } from "@/lib/authz";
import { buildGradeLabels, normalizeGradeValue } from "@/lib/schoolGrades";
import { sectionIsValid } from "@/lib/gradeSections";
import mongoose from "mongoose";
import SchoolConfig from "@/models/SchoolConfig";
import Student from "@/models/Student";
import User from "@/models/User";

export async function POST(request) {
  const { session, error } = await requireApiSession(["SCHOOL_ADMIN"]);
  if (error) return error;

  try {
    const { grade, studentIds, section } = await request.json();
    const schoolId = getSessionSchoolId(session);
    const normalizedGrade = normalizeGradeValue(grade);
    const normalizedSection = String(section || "").trim();
    const ids = [...new Set((Array.isArray(studentIds) ? studentIds : []).map(String))];
    if (!normalizedGrade || ids.length < 1 || ids.length > 500) {
      return NextResponse.json({ message: "Choose a grade and between 1 and 500 students." }, { status: 400 });
    }
    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return NextResponse.json({ message: "One or more selected student IDs are invalid." }, { status: 400 });
    }

    await connectDB();
    const [user, schoolConfig] = await Promise.all([
      User.findById(schoolId).select("schoolConfig").lean(),
      SchoolConfig.findOne({ school: schoolId }).select("gradeSections").lean(),
    ]);
    const grades = buildGradeLabels(user?.schoolConfig);
    if (!grades.includes(normalizedGrade)) {
      return NextResponse.json({ message: "This grade is not configured for your school." }, { status: 400 });
    }
    if (!sectionIsValid(normalizedGrade, normalizedSection, schoolConfig?.gradeSections || [])) {
      return NextResponse.json({ message: "Choose a section configured for this grade, or leave it blank." }, { status: 400 });
    }

    const students = await Student.find({
      _id: { $in: ids },
      school: schoolId,
      grade: normalizedGrade,
      isDeleted: { $ne: true },
    }).select("_id").lean();
    if (students.length !== ids.length) {
      return NextResponse.json({ message: "One or more selected students do not belong to this school and grade." }, { status: 400 });
    }

    const schoolObjectId = new mongoose.Types.ObjectId(String(schoolId));
    const operations = ids.map((id) => ({
      updateOne: {
        filter: { _id: id, school: schoolId, grade: normalizedGrade, isDeleted: { $ne: true } },
        update: [{
          $set: {
            section: normalizedSection,
            enrollments: {
              $map: {
                input: { $ifNull: ["$enrollments", []] },
                as: "enrollment",
                in: {
                  $cond: [
                    { $and: [
                      { $eq: ["$$enrollment.school", schoolObjectId] },
                      { $eq: ["$$enrollment.grade", normalizedGrade] },
                      { $eq: ["$$enrollment.status", "CURRENT"] },
                    ] },
                    { $mergeObjects: ["$$enrollment", { section: normalizedSection }] },
                    "$$enrollment",
                  ],
                },
              },
            },
          },
        }],
      },
    }));
    await Student.bulkWrite(operations, { ordered: true });

    return NextResponse.json({ updatedCount: ids.length, section: normalizedSection });
  } catch (error) {
    console.error("Assign Student Sections Error:", error);
    return NextResponse.json({ message: error.message || "Could not assign sections." }, { status: 500 });
  }
}
