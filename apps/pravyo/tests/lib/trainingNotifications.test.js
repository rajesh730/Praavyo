jest.mock("@/models/UserNotification", () => ({
  __esModule: true,
  default: { bulkWrite: jest.fn(), find: jest.fn(), deleteMany: jest.fn().mockResolvedValue({}) },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Training", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/TrainingRegistration", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/lib/realtimeBus", () => ({ publishRealtimeEvent: jest.fn() }));
jest.mock("@/lib/parentNotifications", () => ({ notifyGuardians: jest.fn().mockResolvedValue({ sent: 1 }) }));

import UserNotification from "@/models/UserNotification";
import User from "@/models/User";
import Training from "@/models/Training";
import TrainingRegistration from "@/models/TrainingRegistration";
import { publishRealtimeEvent } from "@/lib/realtimeBus";
import { notifyGuardians } from "@/lib/parentNotifications";
import {
  announceTraining,
  ensureSchoolTrainingNotices,
  notifyTrainingRegistration,
  notifyTrainingCompleted,
  withdrawTrainingCompletion,
  notifyRegistrationClosed,
  notifyAttendanceReturned,
  remindAttendance,
  SCHOOL_TRAININGS_HREF,
} from "@/lib/trainingNotifications";

const query = (rows) => ({ select: () => ({ lean: () => Promise.resolve(rows) }) });
// Every upsert lands as new unless told otherwise.
const upsertAll = () =>
  UserNotification.bulkWrite.mockImplementation(async (ops) => ({
    upsertedIds: Object.fromEntries(ops.map((_, index) => [index, `n${index}`])),
  }));
const written = (call = 0) => UserNotification.bulkWrite.mock.calls[call][0].map((op) => op.updateOne);

const training = {
  _id: "tr1",
  title: "AI for Students",
  audience: "STUDENTS",
  grades: ["Grade 7", "Grade 8"],
  duration: "1 Day",
  status: "PUBLISHED",
};

beforeEach(() => {
  jest.clearAllMocks();
  upsertAll();
});

describe("announceTraining", () => {
  it("upserts one notice per active school, linking to its Trainings tab", async () => {
    User.find.mockReturnValue(query([{ _id: "s1" }, { _id: "s2" }]));
    await expect(announceTraining(training)).resolves.toBe(2);

    expect(User.find).toHaveBeenCalledWith({ role: "SCHOOL_ADMIN", status: { $in: ["APPROVED", "SUBSCRIBED"] } });
    const [first] = written();
    expect(first.upsert).toBe(true);
    expect(first.filter).toEqual({ dedupeKey: "training:tr1:published:s1" });
    expect(first.update.$setOnInsert).toMatchObject({
      targetRole: "SCHOOL_ADMIN",
      recipientUser: "s1",
      school: "s1",
      category: "TRAINING",
      status: "UNREAD",
      isDeleted: false,
      title: "New training: AI for Students",
      href: SCHOOL_TRAININGS_HREF,
    });
    expect(first.update.$setOnInsert.message).toContain("Grade 7, Grade 8");
    expect(publishRealtimeEvent).toHaveBeenCalledWith("school-notifications", expect.objectContaining({ trainingId: "tr1" }));
  });

  it("counts only schools not told before", async () => {
    User.find.mockReturnValue(query([{ _id: "s1" }, { _id: "s2" }]));
    UserNotification.bulkWrite.mockResolvedValueOnce({ upsertedIds: { 1: "n1" } });
    await expect(announceTraining(training)).resolves.toBe(1);
  });

  it("survives a duplicate-key race", async () => {
    User.find.mockReturnValue(query([{ _id: "s1" }]));
    UserNotification.bulkWrite.mockRejectedValueOnce(
      Object.assign(new Error("E11000"), { code: 11000, result: { upsertedIds: {} } })
    );
    await expect(announceTraining(training)).resolves.toBe(0);
  });

  it("says nothing about drafts", async () => {
    await expect(announceTraining({ ...training, status: "DRAFT" })).resolves.toBe(0);
    expect(UserNotification.bulkWrite).not.toHaveBeenCalled();
  });
});

describe("ensureSchoolTrainingNotices", () => {
  it("announces only the open trainings the school has not heard of", async () => {
    Training.find.mockReturnValue(query([training, { ...training, _id: "tr2", title: "Canva" }]));
    UserNotification.find.mockReturnValue(query([{ dedupeKey: "training:tr1:published:s9" }]));
    await expect(ensureSchoolTrainingNotices("s9")).resolves.toBe(1);
    expect(written()).toHaveLength(1);
    expect(written()[0].filter).toEqual({ dedupeKey: "training:tr2:published:s9" });
  });

  it("writes nothing when the school is up to date", async () => {
    Training.find.mockReturnValue(query([training]));
    UserNotification.find.mockReturnValue(query([{ dedupeKey: "training:tr1:published:s9" }]));
    await expect(ensureSchoolTrainingNotices("s9")).resolves.toBe(0);
    expect(UserNotification.bulkWrite).not.toHaveBeenCalled();
  });
});

describe("notifyTrainingRegistration", () => {
  it("tells new students and their guardians, and withdraws students taken off", async () => {
    UserNotification.find.mockReturnValue(query([{ recipientStudent: "st1" }, { recipientStudent: "gone" }]));
    UserNotification.bulkWrite.mockResolvedValueOnce({ upsertedIds: { 1: "n1" } }); // st1 already told
    const registration = { _id: "r1", school: "s1", participants: [{ student: "st1" }, { student: "st2" }] };

    await expect(notifyTrainingRegistration(training, registration)).resolves.toBe(1);

    const deleted = UserNotification.deleteMany.mock.calls[0][0].$or;
    expect(deleted[0]).toEqual({ dedupeKey: { $in: ["training:tr1:registered:gone"] } });
    expect(written().map((op) => op.update.$setOnInsert.recipientStudent)).toEqual(["st1", "st2"]);
    expect(notifyGuardians).toHaveBeenCalledTimes(1);
    expect(notifyGuardians).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "st2", category: "EVENT", dedupeKey: "training:tr1:registered:st2" })
    );
  });

  it("is silent for teacher trainings", async () => {
    await expect(notifyTrainingRegistration({ ...training, audience: "TEACHERS" }, { participants: [] })).resolves.toBe(0);
    expect(UserNotification.bulkWrite).not.toHaveBeenCalled();
  });
});

describe("notifyTrainingCompleted", () => {
  it("replaces old completion notices, tells the school, students and guardians", async () => {
    const registration = { _id: "r1", school: { _id: "s1" }, participants: [{ student: "st1", attendance: "PRESENT" }, { student: "st2", attendance: "ABSENT" }] };
    await notifyTrainingCompleted(training, registration, [{ _id: "a1", student: "st1", certificateUrl: "/certificates/a1" }]);

    expect(UserNotification.deleteMany).toHaveBeenCalledWith({
      "metadata.trainingId": "tr1",
      "metadata.registrationId": "r1",
      "metadata.kind": { $in: ["completed", "certificate"] },
    });
    const docs = written().map((op) => op.update.$setOnInsert);
    expect(docs[0]).toMatchObject({ targetRole: "SCHOOL_ADMIN", school: "s1", title: "Certificates issued: AI for Students" });
    expect(docs[0].message).toContain("1 present student, 1 absent (no certificate)");
    expect(docs.filter((doc) => doc.targetRole === "STUDENT").map((doc) => doc.recipientStudent)).toEqual(["st1"]);
    expect(docs[1]).toMatchObject({ targetRole: "STUDENT", recipientStudent: "st1", category: "ACHIEVEMENT", href: "/certificates/a1" });
    expect(notifyGuardians).toHaveBeenCalledWith(expect.objectContaining({ studentId: "st1", category: "ACHIEVEMENT" }));
  });

  it("withdraws on undo", async () => {
    await withdrawTrainingCompletion(training, { _id: "r1" });
    expect(UserNotification.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ "metadata.registrationId": "r1" }));
  });
});

describe("attendance notices", () => {
  it("tells every school still marking that registration closed", async () => {
    TrainingRegistration.find.mockReturnValue(query([{ _id: "r1", school: "s1" }, { _id: "r2", school: "s2" }]));
    await expect(notifyRegistrationClosed(training)).resolves.toBe(2);
    expect(TrainingRegistration.find).toHaveBeenCalledWith({ training: "tr1", status: "REGISTERED" });
    expect(written()[0].filter).toEqual({ dedupeKey: "training:tr1:closed:s1" });
    expect(written()[0].update.$setOnInsert.message).toContain("send the attendance to Praavyo");
  });

  it("sends Praavyo's reason back to the school, once per return", async () => {
    const returnedAt = new Date("2026-11-10T00:00:00Z");
    await notifyAttendanceReturned(training, { _id: "r1", school: { _id: "s1" }, returnedAt, returnReason: "Asha was there" });
    const [op] = written();
    expect(op.filter).toEqual({ dedupeKey: `training:tr1:returned:s1:${returnedAt.getTime()}` });
    expect(op.update.$setOnInsert).toMatchObject({ priority: "URGENT", school: "s1" });
    expect(op.update.$setOnInsert.message).toContain("Asha was there");
  });

  it("reminds at most once a Nepal day", async () => {
    await remindAttendance(training, { _id: "r1", school: "s1" }, new Date("2026-11-10T20:00:00Z"));
    // 20:00 UTC is already the 11th in Nepal.
    expect(written()[0].filter).toEqual({ dedupeKey: "training:tr1:remind:s1:2026-11-11" });
  });
});
