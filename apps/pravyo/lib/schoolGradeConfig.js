import mongoose from "mongoose";
import User from "@/models/User";
import SchoolConfig from "@/models/SchoolConfig";
import Student from "@/models/Student";
import { getEquivalentGradeValues, resolveSchoolGrades } from "@/lib/schoolGrades";

/**
 * Server side of a school's grades. Every route that offers or checks grades
 * reads them through here, so Settings → Academic Setup → Grades reaches the
 * whole app at once.
 */

/** Students counted as "in" a grade: still on the school's roll. */
export const ON_ROLL_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"];

/**
 * The school's current grades from its two records. While the school has not
 * edited its grades, `SchoolConfig.grades` is kept as a copy of the signup
 * range (CAS reads that copy); once edited, it is never overwritten.
 * Returns the grades; saves the copy when it is stale.
 */
export async function gradesFromRecords(user, config) {
  const grades = resolveSchoolGrades(user?.schoolConfig, config);
  if (config && !config.gradesCustomized && JSON.stringify(config.grades || []) !== JSON.stringify(grades)) {
    // The condition lives in the database, not in memory: a school's edited
    // list is never overwritten, even by a process whose cached model cannot
    // see `gradesCustomized`.
    const result = await SchoolConfig.updateOne(
      { _id: config._id, gradesCustomized: { $ne: true } },
      { $set: { grades } }
    );
    if (!result.matchedCount) {
      const stored = await SchoolConfig.collection.findOne(
        { _id: config._id },
        { projection: { grades: 1, gradesCustomized: 1 } }
      );
      return resolveSchoolGrades(user?.schoolConfig, stored);
    }
    config.grades = grades;
  }
  return grades;
}

/** The school's current grades, in order (Nursery, LKG, UKG, Grade 1, …). */
export async function loadSchoolGrades(schoolId) {
  const [user, config] = await Promise.all([
    User.findById(schoolId).select("schoolConfig").lean(),
    SchoolConfig.findOne({ school: schoolId }),
  ]);
  return gradesFromRecords(user, config);
}

/** Students on the school's roll per grade label: { "Grade 3": 41, … }. */
export async function countStudentsByGrade(schoolId, grades) {
  const counts = Object.fromEntries(grades.map((grade) => [grade, 0]));
  if (!grades.length) return counts;
  const rows = await Student.aggregate([
    {
      $match: {
        // Aggregations skip Mongoose casting.
        school: new mongoose.Types.ObjectId(String(schoolId)),
        status: { $in: ON_ROLL_STATUSES },
        isDeleted: { $ne: true },
      },
    },
    { $group: { _id: "$grade", count: { $sum: 1 } } },
  ]);
  for (const row of rows) {
    const grade = grades.find((label) => getEquivalentGradeValues(label).includes(String(row._id || "")));
    if (grade) counts[grade] += row.count;
  }
  return counts;
}
