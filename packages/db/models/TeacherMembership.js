import mongoose from "mongoose";

/**
 * One teacher's relationship with one school.
 *
 * A Teacher document is the person and their login (one per human, across all
 * of Pravyo). Whether they may work at a given school lives here, so a teacher
 * can teach at several schools and leaving one never touches the others.
 *
 *   ACTIVE   — can sign in to this school and see their assigned work
 *   INACTIVE — temporarily blocked by the school (leave, suspension)
 *   LEFT     — no longer works here; history is kept, access is gone
 *
 * Nothing is ever deleted: a teacher who left can be rejoined later.
 */
const endedAssignmentSchema = new mongoose.Schema({
  grade: { type: String, trim: true },
  assignmentType: { type: String, enum: ["SUBJECT_TEACHER", "CLASS_TEACHER"] },
  subjectTitle: { type: String, trim: true, default: "" },
  subjectCode: { type: String, trim: true, default: "" },
  endedAt: { type: Date, default: Date.now },
}, { _id: false });

const TeacherMembershipSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: {
    type: String,
    enum: ["ACTIVE", "INACTIVE", "LEFT"],
    default: "ACTIVE",
  },
  designation: { type: String, trim: true, maxlength: 80, default: "" },
  employmentType: {
    type: String,
    enum: ["FULL_TIME", "PART_TIME", "CONTRACT"],
    default: "FULL_TIME",
  },
  dateOfJoining: { type: Date, default: null },
  leftAt: { type: Date, default: null },
  leftNote: { type: String, trim: true, maxlength: 300, default: "" },
  statusChangedAt: { type: Date, default: null },
  statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // What the teacher was responsible for when they left, so the record still
  // reads "taught Grade 3 Science" after the live assignments are cleared.
  endedAssignments: { type: [endedAssignmentSchema], default: [] },
}, { timestamps: true });

TeacherMembershipSchema.index({ teacher: 1, school: 1 }, { unique: true });
TeacherMembershipSchema.index({ school: 1, status: 1, createdAt: -1 });
TeacherMembershipSchema.index({ teacher: 1, status: 1 });

export default mongoose.models.TeacherMembership ||
  mongoose.model("TeacherMembership", TeacherMembershipSchema);
