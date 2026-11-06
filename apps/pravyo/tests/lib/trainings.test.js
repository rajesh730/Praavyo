const chain = (value) => {
  const query = { select: () => query, sort: () => query, lean: () => Promise.resolve(value) };
  return query;
};

jest.mock("@/models/Training", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/TrainingRegistration", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock("@/models/Achievement", () => ({
  __esModule: true,
  default: { deleteMany: jest.fn(), insertMany: jest.fn(), find: jest.fn() },
}));
jest.mock("@/models/Student", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Teacher", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/TeacherMembership", () => ({ __esModule: true, default: { find: jest.fn() } }));

import TrainingRegistration from "@/models/TrainingRegistration";
import Achievement from "@/models/Achievement";
import Student from "@/models/Student";
import Teacher from "@/models/Teacher";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import {
  completeRegistration,
  parseTraining,
  registrationOpen,
  reopenRegistration,
  returnAttendance,
  saveAttendance,
  saveRegistration,
  serializeRegistration,
} from "@/lib/trainings";

const SCHOOL = "65f0c0ffee0000000000aaaa";
const S1 = "65f0c0ffee0000000000b001";
const S2 = "65f0c0ffee0000000000b002";
const S3 = "65f0c0ffee0000000000b003";
const T1 = "65f0c0ffee0000000000c001";

const studentTraining = { _id: "65f0c0ffee0000000000d001", audience: "STUDENTS", grades: [], status: "PUBLISHED", registrationDeadline: null, title: "AI Basics" };
const teacherTraining = { ...studentTraining, _id: "65f0c0ffee0000000000d002", audience: "TEACHERS", title: "Canva 5-Day Training" };
const students = [
  { _id: S1, name: "Asha", grade: "Grade 5" },
  { _id: S2, name: "Bikash", grade: "Grade 6" },
  { _id: S3, name: "Chandra", grade: "Grade 6" },
];

beforeEach(() => {
  jest.clearAllMocks();
  Student.find.mockReturnValue(chain(students));
  TeacherMembership.find.mockReturnValue(chain([{ teacher: T1 }]));
  Teacher.find.mockReturnValue(chain([{ _id: T1, name: "Gita Rai", designation: "Science" }]));
  TrainingRegistration.findOne.mockResolvedValue(null);
  TrainingRegistration.findOneAndUpdate.mockImplementation((filter, update) => Promise.resolve({ ...filter, ...update.$set }));
});

describe("parseTraining", () => {
  it("needs a title and an audience", () => {
    expect(() => parseTraining({ audience: "STUDENTS" })).toThrow("Give the training a title.");
    expect(() => parseTraining({ title: "AI Basics" })).toThrow("Choose who the training is for.");
  });

  it("keeps grades only for student trainings and ends the deadline at midnight in Nepal", () => {
    const teachers = parseTraining({ title: "Canva", audience: "TEACHERS", grades: ["Grade 5"], registrationDeadline: "2026-11-20" });
    expect(teachers.grades).toEqual([]);
    expect(teachers.registrationDeadline.toISOString()).toBe("2026-11-20T18:14:59.000Z");
    expect(parseTraining({ title: "AI", audience: "STUDENTS", grades: ["Grade 5", "Grade 5"] }).grades).toEqual(["Grade 5"]);
  });
});

describe("registrationOpen", () => {
  it("is open while published and before the deadline", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(registrationOpen({ status: "PUBLISHED" }, now)).toBe(true);
    expect(registrationOpen({ status: "DRAFT" }, now)).toBe(false);
    expect(registrationOpen({ status: "CLOSED" }, now)).toBe(false);
    expect(registrationOpen({ status: "PUBLISHED", registrationDeadline: new Date("2026-11-09T00:00:00Z") }, now)).toBe(false);
  });
});

describe("saveRegistration", () => {
  it("reads a whole grade as whole, whatever mode the client sent", async () => {
    const saved = await saveRegistration(studentTraining, SCHOOL, { participants: [S2, S3] });
    expect(saved.participants.map((row) => row.name)).toEqual(["Bikash", "Chandra"]);
    expect(saved.selection).toEqual({ mode: "GRADES", grades: ["Grade 6"] });
  });

  it("keeps whole grades alongside students picked inside another grade", async () => {
    const saved = await saveRegistration(studentTraining, SCHOOL, { participants: [S1, S2] });
    expect(saved.selection).toEqual({ mode: "CHOSEN", grades: ["Grade 5"] });
  });

  it("registers the whole school", async () => {
    const saved = await saveRegistration(studentTraining, SCHOOL, { mode: "ALL" });
    expect(saved.participants).toHaveLength(3);
    expect(saved.selection.mode).toBe("ALL");
    expect(saved.participants[0]).toEqual({ student: S1, name: "Asha", grade: "Grade 5", section: "", attendance: null });
  });

  it("keeps attendance already marked for people who stay on the list", async () => {
    TrainingRegistration.findOne.mockResolvedValue({
      status: "REGISTERED",
      participants: [{ student: S1, attendance: "ABSENT" }, { student: S2, attendance: "PRESENT" }],
    });
    const saved = await saveRegistration(studentTraining, SCHOOL, { participants: [S1, S3] });
    expect(saved.participants.map((row) => row.attendance)).toEqual(["ABSENT", null]);
  });

  it("refuses a chosen student who is not on the school's roster", async () => {
    await expect(saveRegistration(studentTraining, SCHOOL, { participants: [S1, "65f0c0ffee0000000000ffff"] }))
      .rejects.toThrow("not an active member of your school");
  });

  it("registers chosen teachers for a teacher training, and never by grade", async () => {
    const saved = await saveRegistration(teacherTraining, SCHOOL, { participants: [T1] });
    expect(saved.participants).toEqual([{ teacher: T1, name: "Gita Rai", grade: "", section: "", attendance: null }]);
    await expect(saveRegistration(teacherTraining, SCHOOL, { mode: "GRADES", grades: ["Grade 5"] }))
      .rejects.toThrow("Teachers are registered all together or one by one.");
  });

  it("refuses once registration is closed, attendance is sent or the training is completed", async () => {
    await expect(saveRegistration({ ...studentTraining, status: "CLOSED" }, SCHOOL, { mode: "ALL" }))
      .rejects.toThrow("Registration for this training is closed.");
    TrainingRegistration.findOne.mockResolvedValue({ status: "SUBMITTED" });
    await expect(saveRegistration(studentTraining, SCHOOL, { mode: "ALL" })).rejects.toThrow("sent to Praavyo");
    TrainingRegistration.findOne.mockResolvedValue({ status: "COMPLETED" });
    await expect(saveRegistration(studentTraining, SCHOOL, { mode: "ALL" })).rejects.toThrow("already completed");
  });
});

describe("saveAttendance", () => {
  const NOW = new Date("2026-11-10T08:00:00Z");
  const registered = (attendance = [null, null]) => ({
    status: "REGISTERED",
    participants: [
      { student: S1, name: "Asha", attendance: attendance[0] },
      { student: S2, name: "Bikash", attendance: attendance[1] },
    ],
    trainingDate: null,
    save: jest.fn(),
  });

  it("saves a draft: marks and the training day, still with the school", async () => {
    const registration = registered();
    TrainingRegistration.findOne.mockResolvedValue(registration);
    await saveAttendance(studentTraining, SCHOOL, { marks: { [S1]: "PRESENT" }, trainingDate: "2026-11-09" }, { now: NOW });
    expect(registration.participants[0].attendance).toBe("PRESENT");
    expect(registration.participants[1].attendance).toBeNull();
    expect(registration.trainingDate.toISOString()).toBe("2026-11-09T06:15:00.000Z");
    expect(registration.status).toBe("REGISTERED");
    expect(registration.save).toHaveBeenCalled();
  });

  it("sends to Praavyo only when everyone is marked, the day is set and someone was present", async () => {
    TrainingRegistration.findOne.mockResolvedValue(registered(["PRESENT", null]));
    await expect(saveAttendance(studentTraining, SCHOOL, { trainingDate: "2026-11-09", submit: true }, { now: NOW }))
      .rejects.toThrow("1 not marked yet");

    TrainingRegistration.findOne.mockResolvedValue(registered(["PRESENT", "ABSENT"]));
    await expect(saveAttendance(studentTraining, SCHOOL, { submit: true }, { now: NOW })).rejects.toThrow("day the training was held");

    TrainingRegistration.findOne.mockResolvedValue(registered(["ABSENT", "ABSENT"]));
    await expect(saveAttendance(studentTraining, SCHOOL, { trainingDate: "2026-11-09", submit: true }, { now: NOW }))
      .rejects.toThrow("Nobody is marked present");

    const registration = { ...registered(["PRESENT", "ABSENT"]), returnReason: "Fix Asha" };
    TrainingRegistration.findOne.mockResolvedValue(registration);
    await saveAttendance(studentTraining, SCHOOL, { trainingDate: "2026-11-09", submit: true }, { now: NOW, actorId: SCHOOL });
    expect(registration.status).toBe("SUBMITTED");
    expect(registration.attendanceSubmittedAt).toBe(NOW);
    expect(registration.returnReason).toBe("");
  });

  it("refuses a future day, a stranger, or attendance already sent", async () => {
    TrainingRegistration.findOne.mockResolvedValue(registered());
    await expect(saveAttendance(studentTraining, SCHOOL, { trainingDate: "2026-11-12" }, { now: NOW })).rejects.toThrow("future");
    await expect(saveAttendance(studentTraining, SCHOOL, { marks: { "65f0c0ffee0000000000ffff": "PRESENT" } }, { now: NOW }))
      .rejects.toThrow("not on your registered list");
    TrainingRegistration.findOne.mockResolvedValue({ status: "SUBMITTED" });
    await expect(saveAttendance(studentTraining, SCHOOL, {}, { now: NOW })).rejects.toThrow("already sent");
  });
});

describe("completeRegistration", () => {
  const submitted = (participants, extra = {}) => ({
    _id: "65f0c0ffee0000000000e001",
    school: { _id: SCHOOL, schoolName: "Green Villege" },
    status: "SUBMITTED",
    trainingDate: new Date("2026-11-05T06:15:00.000Z"),
    participants,
    save: jest.fn(),
    ...extra,
  });

  it("issues certificates only to those marked present, dated the school's day", async () => {
    const registration = submitted([
      { student: S1, name: "Asha", attendance: "PRESENT" },
      { student: S2, name: "Bikash", attendance: "ABSENT" },
    ]);
    const issued = await completeRegistration(studentTraining, registration, { actorId: "admin" });

    expect(issued).toBe(1);
    const docs = Achievement.insertMany.mock.calls[0][0];
    expect(docs.map((doc) => doc.certificateRecipientName)).toEqual(["Asha"]);
    expect(docs[0].awardedAt.toISOString()).toBe("2026-11-05T06:15:00.000Z");
    expect(registration.status).toBe("COMPLETED");
  });

  it("issues a teacher certificate, with Praavyo's corrected day", async () => {
    const registration = submitted([{ teacher: T1, name: "Gita Rai", grade: "", attendance: "PRESENT" }]);
    await completeRegistration(teacherTraining, registration, { trainingDate: "2026-11-06", actorId: "admin" });
    const [doc] = Achievement.insertMany.mock.calls[0][0];
    expect(doc).toMatchObject({ school: SCHOOL, teacher: T1, student: null, recipientType: "TEACHER", placement: "PARTICIPANT" });
    expect(doc.certificateUrl).toBe(`/certificates/${doc._id}`);
    expect(doc.awardedAt.toISOString()).toBe("2026-11-06T06:15:00.000Z");
  });

  it("treats a legacy list with no attendance as everyone present", async () => {
    const issued = await completeRegistration(studentTraining, submitted([{ student: S1, name: "Asha" }, { student: S2, name: "Bikash" }]), {});
    expect(issued).toBe(2);
  });

  it("refuses a draft, attendance not yet sent, or nobody present", async () => {
    await expect(completeRegistration({ ...studentTraining, status: "DRAFT" }, submitted([]), {})).rejects.toThrow("Publish the training first.");
    await expect(completeRegistration(studentTraining, submitted([], { status: "REGISTERED" }), {})).rejects.toThrow("not sent its attendance");
    await expect(completeRegistration(studentTraining, submitted([{ student: S1, name: "Asha", attendance: "ABSENT" }]), {}))
      .rejects.toThrow("Nobody from this school");
  });
});

describe("return, undo and what the screens see", () => {
  it("sends attendance back with a reason, and undo returns it to Praavyo", async () => {
    const registration = { _id: "r1", status: "SUBMITTED", save: jest.fn() };
    await expect(returnAttendance(registration, " ")).rejects.toThrow("what to correct");
    await returnAttendance(registration, "Asha was there", new Date("2026-11-10T00:00:00Z"));
    expect(registration).toMatchObject({ status: "REGISTERED", returnReason: "Asha was there" });

    const completed = { _id: "r2", status: "COMPLETED", save: jest.fn() };
    await reopenRegistration(completed);
    expect(Achievement.deleteMany).toHaveBeenCalledWith({ trainingRegistration: "r2" });
    expect(completed.status).toBe("SUBMITTED");
  });

  it("counts present and absent, showing not-marked only while the school is marking", () => {
    const people = [{ student: S1, name: "Asha", attendance: "PRESENT" }, { student: S2, name: "Bikash", attendance: null }];
    const marking = serializeRegistration({ _id: "r1", training: "t", school: SCHOOL, status: "REGISTERED", participants: people });
    expect(marking).toMatchObject({ presentCount: 1, absentCount: 0 });
    expect(marking.participants[1].attendance).toBeNull();
    const legacy = serializeRegistration({ _id: "r1", training: "t", school: SCHOOL, status: "COMPLETED", participants: people });
    expect(legacy.presentCount).toBe(2);
  });
});

