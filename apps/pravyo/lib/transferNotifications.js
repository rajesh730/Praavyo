import UserNotification from "@/models/UserNotification";
import User from "@/models/User";
import { publishRealtimeEvent } from "@/lib/realtimeBus";
import { publishWorkIndicatorsUpdate } from "@/lib/workIndicatorRealtime";
import { notifyGuardians } from "@/lib/parentNotifications";

// The family follows a transfer in the parent app; the student still gets a
// note in their own notifications.
const STUDENT_TRANSFER_HREF = "/student/dashboard";
const PARENT_TRANSFER_HREF = "/parent/transfer";
const SCHOOL_TRANSFER_HREF = "/school/dashboard?tab=student-transfers";

function withReason(message, reason) {
  const trimmed = String(reason || "").trim();
  return trimmed ? `${message} Reason: ${trimmed}` : message;
}

async function resolveSchoolName(schoolId) {
  if (!schoolId) return "the school";
  const school = await User.findById(schoolId).select("schoolName name").lean();
  return school?.schoolName || school?.name || "the school";
}

function buildStudentNotification({ transfer, title, message, schoolId }) {
  const recipientStudent = transfer?.student;
  const school = schoolId || transfer?.fromSchool;
  if (!recipientStudent || !school) return null;
  return {
    targetRole: "STUDENT",
    recipientStudent,
    school,
    category: "TRANSFER",
    title,
    message,
    href: STUDENT_TRANSFER_HREF,
    metadata: {
      transferId: String(transfer._id || ""),
      status: transfer.status || "",
    },
  };
}

function buildSchoolNotification({ transfer, schoolId, title, message }) {
  if (!schoolId) return null;
  return {
    targetRole: "SCHOOL_ADMIN",
    recipientUser: schoolId,
    school: schoolId,
    category: "TRANSFER",
    title,
    message,
    href: SCHOOL_TRANSFER_HREF,
    metadata: {
      transferId: String(transfer?._id || ""),
      status: transfer?.status || "",
    },
  };
}

// Persist the notifications and nudge the relevant realtime channels so bell
// dropdowns, notice pages, and sidebar dots refresh without a manual reload.
async function dispatch({ transfer, docs, kind, notifiedStudent, schoolIds }) {
  const validDocs = docs.filter(Boolean);
  if (validDocs.length === 0) return;

  await UserNotification.insertMany(validDocs);

  // Whatever the student is told, their guardians are told too — they are the
  // ones who act on it now.
  const studentDocs = validDocs.filter((doc) => doc.targetRole === "STUDENT");
  await Promise.all(
    studentDocs.map((doc) =>
      notifyGuardians({
        studentId: transfer.student,
        category: "TRANSFER",
        title: doc.title,
        message: doc.message,
        href: PARENT_TRANSFER_HREF,
        metadata: doc.metadata,
      }).catch((error) => {
        console.error("[transferNotifications] guardian delivery failed:", error.message);
      })
    )
  );

  if (notifiedStudent) {
    publishRealtimeEvent("student-notifications", {
      kind,
      transferId: String(transfer._id || ""),
    });
  }
  if (schoolIds.length > 0) {
    publishRealtimeEvent("school-notifications", {
      kind,
      transferId: String(transfer._id || ""),
    });
  }
  publishWorkIndicatorsUpdate(kind, {
    transferId: String(transfer._id || ""),
    studentId: String(transfer.student || ""),
    schoolIds,
  });
}

// Student asked their current school to release them.
export async function notifyReleaseRequested({ transfer } = {}) {
  if (!transfer?.fromSchool) return;
  const name = transfer.studentNameSnapshot || "A student";
  await dispatch({
    transfer,
    docs: [
      buildSchoolNotification({
        transfer,
        schoolId: transfer.fromSchool,
        title: "New transfer request",
        message: `A transfer was requested for ${name}. Review it to approve or reject.`,
      }),
    ],
    kind: "transfer-release-requested",
    notifiedStudent: false,
    schoolIds: [String(transfer.fromSchool)],
  });
}

// Current school approved the release and a transfer code was issued.
export async function notifyReleaseApproved({ transfer } = {}) {
  if (!transfer?.student) return;
  const code = transfer.transferCode
    ? ` Your transfer code is ${transfer.transferCode}.`
    : "";
  await dispatch({
    transfer,
    docs: [
      buildStudentNotification({
        transfer,
        title: "Transfer release approved",
        message: `The school approved the release. Now choose the new school.${code}`,
      }),
    ],
    kind: "transfer-release-approved",
    notifiedStudent: true,
    schoolIds: [],
  });
}

// Student selected a destination school; that school now has an admission request.
export async function notifyAdmissionRequested({ transfer } = {}) {
  if (!transfer?.toSchool) return;
  const name = transfer.studentNameSnapshot || "A released student";
  await dispatch({
    transfer,
    docs: [
      buildSchoolNotification({
        transfer,
        schoolId: transfer.toSchool,
        title: "New admission request",
        message: `${name} asked to join your school via transfer. Assign a grade and roll number to admit them.`,
      }),
    ],
    kind: "transfer-admission-requested",
    notifiedStudent: false,
    schoolIds: [String(transfer.toSchool)],
  });
}

// Destination school admitted the student — the move is complete.
export async function notifyAdmissionApproved({ transfer } = {}) {
  if (!transfer?.student) return;
  const toSchoolName = await resolveSchoolName(transfer.toSchool);
  const name = transfer.studentNameSnapshot || "A student";
  const schoolIds = [];
  const docs = [
    buildStudentNotification({
      transfer,
      // After the move the student's current school is the destination, so the
      // notification is filed under the destination school they now belong to.
      schoolId: transfer.toSchool,
      title: "Admission approved",
      message: `The transfer to ${toSchoolName} is complete. Welcome to the new school!`,
    }),
  ];
  if (transfer.fromSchool) {
    docs.push(
      buildSchoolNotification({
        transfer,
        schoolId: transfer.fromSchool,
        title: "Transfer completed",
        message: `${name}'s transfer to ${toSchoolName} is complete. They have left your active roster.`,
      })
    );
    schoolIds.push(String(transfer.fromSchool));
  }
  await dispatch({
    transfer,
    docs,
    kind: "transfer-admission-approved",
    notifiedStudent: true,
    schoolIds,
  });
}

/**
 * Notify the people involved when a transfer is rejected.
 *
 * type:
 *  - "release":   current school declined the student's release request.
 *  - "admission": chosen school declined the student's admission.
 *  - "claim":     legacy — current school declined a school-initiated request.
 */
export async function notifyTransferRejected({ transfer, type, reason } = {}) {
  if (!transfer) return;

  const name = transfer.studentNameSnapshot || "The student";
  const docs = [];
  let notifiedStudent = false;
  const schoolIds = [];

  if (type === "release") {
    docs.push(
      buildStudentNotification({
        transfer,
        title: "Transfer request rejected",
        message: withReason(
          "The current school declined the transfer request.",
          reason
        ),
      })
    );
    notifiedStudent = true;
  } else if (type === "admission") {
    docs.push(
      buildStudentNotification({
        transfer,
        title: "Admission request rejected",
        message: withReason(
          "The new school declined the admission. You can choose another school.",
          reason
        ),
      })
    );
    notifiedStudent = true;

    if (transfer.fromSchool) {
      docs.push(
        buildSchoolNotification({
          transfer,
          schoolId: transfer.fromSchool,
          title: "Student admission rejected",
          message: withReason(
            `${name}'s admission was rejected by the selected school. They remain released and can choose another school.`,
            reason
          ),
        })
      );
      schoolIds.push(String(transfer.fromSchool));
    }
  } else if (type === "claim") {
    const destinationSchool = transfer.toSchool;
    if (destinationSchool) {
      docs.push(
        buildSchoolNotification({
          transfer,
          schoolId: destinationSchool,
          title: "Transfer request rejected",
          message: withReason(
            `Your transfer request for ${name} was rejected by their current school.`,
            reason
          ),
        })
      );
      schoolIds.push(String(destinationSchool));
    }
  }

  await dispatch({
    transfer,
    docs,
    kind: "transfer-rejected",
    notifiedStudent,
    schoolIds,
  });
}
