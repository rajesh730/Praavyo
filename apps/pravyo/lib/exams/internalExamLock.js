import { handler, teacherHandler } from '@pravyo/cas/lib/casRoute';

/**
 * Compatibility exports for Internal Exam API routes. The former launch lock
 * was removed so school admins and teachers can test the feature.
 */

/** School-admin Internal Exam endpoints. */
export const internalExamHandler = (fn) => handler(fn);

/** Teacher Internal Exam endpoints. */
export const internalExamTeacherHandler = (fn) => teacherHandler(fn);
