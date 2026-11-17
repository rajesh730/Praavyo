// Transfer out: the school records a move to a school that is not on Praavyo.
jest.mock("@/models/Student", () => ({ __esModule: true, default: { findOne: jest.fn(), exists: jest.fn() } }));
jest.mock("@/models/StudentTransfer", () => {
  const StudentTransfer = jest.fn(function StudentTransfer(fields) {
    Object.assign(this, fields, { _id: "transfer-1", save: jest.fn().mockResolvedValue(this) });
  });
  StudentTransfer.exists = jest.fn();
  StudentTransfer.updateOne = jest.fn();
  return { __esModule: true, default: StudentTransfer };
});
jest.mock("@/models/AcademicYear", () => ({ __esModule: true, default: { updateOne: jest.fn() } }));
jest.mock("@/models/SchoolMagazineArticle", () => ({ __esModule: true, default: { updateMany: jest.fn() } }));
jest.mock("@/models/ParentStudentLink", () => ({
  __esModule: true,
  default: { updateMany: jest.fn(), find: jest.fn() },
  applyAccessLevelDefaults: jest.fn((link) => link),
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ schoolName: "Green Villege" }) }) })) },
}));
jest.mock("@/lib/studentEnrollment", () => ({
  ensureActiveAcademicYear: jest.fn(async () => ({ _id: "year-1", year: "2083", yearStart: 2026 })),
  closeCurrentEnrollments: jest.requireActual("@/lib/studentEnrollment").closeCurrentEnrollments,
  makeEnrollmentEntry: jest.requireActual("@/lib/studentEnrollment").makeEnrollmentEntry,
}));
jest.mock("@/lib/studentTransfers", () => ({ OPEN_TRANSFER_STATUSES: ["PENDING_RELEASE", "RELEASED", "PENDING_ADMISSION", "PENDING"] }));
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual,
      startSession: jest.fn(async () => ({ withTransaction: async (fn) => fn(), endSession: jest.fn() })),
    },
  };
});

import Student from "@/models/Student";
import StudentTransfer from "@/models/StudentTransfer";
import ParentStudentLink from "@/models/ParentStudentLink";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import {
  parseTransferOutInput, transferStudentOut, undoTransferOut, TransferOutError,
} from "@/lib/studentTransferOut";

const SCHOOL = "507f1f77bcf86cd799439000";

function studentDoc(overrides = {}) {
  return {
    _id: "student-1",
    name: "Sita Rai",
    grade: "Grade 3",
    rollNumber: "5",
    status: "ACTIVE",
    enrollments: [{ school: SCHOOL, grade: "Grade 3", rollNumber: "5", status: "CURRENT", endedAt: null }],
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("transfer-out input", () => {
  it("needs the new school's name", () => {
    expect(() => parseTransferOutInput({ toSchoolName: "  " })).toThrow(TransferOutError);
  });

  it("cleans the IEMIS number and rejects a malformed one", () => {
    expect(parseTransferOutInput({ toSchoolName: "Shree School", toSchoolIemisNumber: " ab 12 " }).toSchoolIemisNumber).toBe("AB12");
    expect(() => parseTransferOutInput({ toSchoolName: "Shree School", toSchoolIemisNumber: "12/34" })).toThrow(/IEMIS/);
  });

  it("refuses a date in the future", () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(() => parseTransferOutInput({ toSchoolName: "Shree School", transferDate: nextYear })).toThrow(/future/);
  });
});

describe("transferring a student out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    StudentTransfer.exists.mockResolvedValue(null);
  });

  it("takes the student off the roster, keeps their history, and records where they went", async () => {
    const student = studentDoc();
    Student.findOne.mockResolvedValue(student);

    const { transfer } = await transferStudentOut({
      studentId: "student-1", schoolId: SCHOOL, actorId: SCHOOL,
      input: { toSchoolName: "Shree Janata School", toSchoolIemisNumber: "1234", certificateNumber: "TC-9" },
    });

    expect(student.status).toBe("TRANSFERRED_OUT");
    expect(student.enrollments[0].status).toBe("TRANSFERRED");
    expect(student.transferOut.toSchoolName).toBe("Shree Janata School");
    expect(student.save).toHaveBeenCalled();
    expect(transfer).toMatchObject({ status: "COMPLETED", toSchool: null, toSchoolIemisNumber: "1234", certificateNumber: "TC-9" });
    expect(transfer.externalSchool.name).toBe("Shree Janata School");
    // Off the school's walls, still the student's.
    expect(SchoolMagazineArticle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ authorStudent: "student-1", school: SCHOOL }),
      { $set: { showOnSchoolWall: false, isGlobalWallPublished: false } },
      expect.anything(),
    );
  });

  it("leaves guardians able to look, but not reachable by the old school", async () => {
    Student.findOne.mockResolvedValue(studentDoc());
    await transferStudentOut({ studentId: "student-1", schoolId: SCHOOL, actorId: SCHOOL, input: { toSchoolName: "X" } });
    expect(ParentStudentLink.updateMany).toHaveBeenCalledWith(
      { student: "student-1", status: "ACTIVE" },
      { $set: { canViewPortfolio: true, canReceiveNotices: false, canRegisterEvents: false, canGiveConsent: false, canMessageSchool: false } },
      expect.anything(),
    );
  });

  it("refuses a student already off the roster", async () => {
    Student.findOne.mockResolvedValue(studentDoc({ status: "TRANSFERRED_OUT" }));
    await expect(transferStudentOut({ studentId: "s", schoolId: SCHOOL, actorId: SCHOOL, input: { toSchoolName: "X" } }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("refuses while a Praavyo transfer is in progress", async () => {
    Student.findOne.mockResolvedValue(studentDoc());
    StudentTransfer.exists.mockResolvedValue({ _id: "open" });
    await expect(transferStudentOut({ studentId: "s", schoolId: SCHOOL, actorId: SCHOOL, input: { toSchoolName: "X" } }))
      .rejects.toThrow(/in progress/);
  });

  it("only finds the school's own students", async () => {
    Student.findOne.mockResolvedValue(null);
    await expect(transferStudentOut({ studentId: "s", schoolId: SCHOOL, actorId: SCHOOL, input: { toSchoolName: "X" } }))
      .rejects.toMatchObject({ status: 404 });
    expect(Student.findOne).toHaveBeenCalledWith(expect.objectContaining({ school: SCHOOL }));
  });
});

describe("undoing a transfer out", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reopens the same enrollment and restores the student", async () => {
    const at = new Date("2026-11-17T00:00:00Z");
    const student = studentDoc({
      status: "TRANSFERRED_OUT",
      transferOut: { toSchoolName: "X", transferredAt: at, transfer: "transfer-1" },
      enrollments: [{ school: SCHOOL, grade: "Grade 3", status: "TRANSFERRED", endedAt: at }],
    });
    Student.findOne.mockResolvedValue(student);
    Student.exists.mockResolvedValue(null);
    ParentStudentLink.find.mockResolvedValue([]);

    await undoTransferOut({ studentId: "student-1", schoolId: SCHOOL, actorId: SCHOOL });

    expect(student.status).toBe("ACTIVE");
    expect(student.enrollments).toHaveLength(1);
    expect(student.enrollments[0]).toMatchObject({ status: "CURRENT", endedAt: null });
    expect(StudentTransfer.updateOne).toHaveBeenCalledWith(
      { _id: "transfer-1", status: "COMPLETED" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "CANCELLED" }) }),
      expect.anything(),
    );
  });

  it("refuses when the roll number has been given to someone else", async () => {
    Student.findOne.mockResolvedValue(studentDoc({ status: "TRANSFERRED_OUT", transferOut: {} }));
    Student.exists.mockResolvedValue({ _id: "other" });
    await expect(undoTransferOut({ studentId: "student-1", schoolId: SCHOOL, actorId: SCHOOL }))
      .rejects.toThrow(/Roll number 5/);
  });
});
