import mongoose from 'mongoose';

/** School-owned responsibilities, separate from temporary exam permissions. */
const teacherTeachingAssignmentSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  grade: { type: String, required: true, trim: true },
  assignmentType: {
    type: String,
    enum: ['SUBJECT_TEACHER', 'CLASS_TEACHER'],
    required: true,
  },
  // Class-teacher assignments intentionally have no subject. A subject teacher
  // points to the school's CAS subject so their published-result view is exact.
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'CasSubject', default: null },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });

teacherTeachingAssignmentSchema.index(
  { school: 1, teacher: 1, grade: 1, assignmentType: 1, subject: 1 },
  { unique: true },
);
teacherTeachingAssignmentSchema.index({ school: 1, teacher: 1, grade: 1 });
teacherTeachingAssignmentSchema.index({ school: 1, grade: 1, assignmentType: 1 });

export default mongoose.models.TeacherTeachingAssignment ||
  mongoose.model('TeacherTeachingAssignment', teacherTeachingAssignmentSchema);
