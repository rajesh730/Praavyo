/**
 * Student status: who is on a school's roster right now.
 *
 *   ACTIVE           on the roster (signs in, in class lists, exams, notices)
 *   SUSPENDED        on the roster but temporarily barred from signing in
 *   INACTIVE         left the school, reason unspecified (legacy "left school")
 *   TRANSFERRED_OUT  moved to a school that is NOT on Praavyo. The school
 *                    recorded the move (Students -> Transfer out); the student
 *                    leaves its roster and control, their history stays.
 *                    A move between two Praavyo schools uses the transfer flow
 *                    instead and keeps the student ACTIVE at the new school.
 *   ALUMNI/GRADUATED finished the school's last grade
 *
 * Every "is this student still on the roster?" check should use
 * OFF_ROSTER_STATUSES from here, so a new status cannot be missed in one place.
 */
export const STUDENT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE", "TRANSFERRED_OUT", "ALUMNI", "GRADUATED"];

/** Students in these states no longer hold a place (roll number, class lists). */
export const OFF_ROSTER_STATUSES = ["ALUMNI", "GRADUATED", "INACTIVE", "TRANSFERRED_OUT"];

/** States in which the school can no longer change the student's record. */
export const SCHOOL_READ_ONLY_STATUSES = ["TRANSFERRED_OUT"];

export const STUDENT_STATUS_LABELS = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  INACTIVE: "Inactive (left school)",
  TRANSFERRED_OUT: "Transferred out",
  ALUMNI: "Alumni (graduated)",
  GRADUATED: "Graduated",
};
