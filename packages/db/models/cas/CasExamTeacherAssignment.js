import mongoose from 'mongoose';
import { casOptions, reqRefId } from './casShared.js';

/**
 * A school-controlled teaching permission for one assessment subject.
 *
 * The record deliberately belongs to an exam, grade and subject rather than a
 * Teacher document. A teacher can therefore work in several grades/subjects,
 * and removing one assignment takes effect immediately without disabling the
 * teacher's other work.
 */
const casExamTeacherAssignmentSchema = new mongoose.Schema({
  school: reqRefId('User'),
  academicYear: reqRefId('AcademicYear'),
  exam: reqRefId('CasExam'),
  grade: { type: String, required: true, trim: true },
  subject: reqRefId('CasSubject'),
  teacher: reqRefId('Teacher'),
  assignedBy: reqRefId('User'),
}, casOptions);

casExamTeacherAssignmentSchema.index(
  { school: 1, academicYear: 1, exam: 1, grade: 1, subject: 1, teacher: 1 },
  { unique: true },
);
casExamTeacherAssignmentSchema.index({ school: 1, teacher: 1, academicYear: 1, grade: 1 });
casExamTeacherAssignmentSchema.index({ school: 1, exam: 1, grade: 1, subject: 1 });

export default mongoose.models.CasExamTeacherAssignment ||
  mongoose.model('CasExamTeacherAssignment', casExamTeacherAssignmentSchema);
