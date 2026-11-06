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
  saveRegistration,
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
  it("registers everyone in the chosen grades", async () => {
    const saved = await saveRegistration(studentTraining, SCHOOL, { mode: "GRADES", grades: ["Grade 6"] });
    expect(saved.participants.map((row) => row.name)).toEqual(["Bikash", "Chandra"]);
    expect(saved.selection).toEqual({ mode: "GRADES", grades: ["Grade 6"] });
  });

  it("registers the whole school", async () => {
    const saved = await saveRegistration(studentTraining, SCHOOL, { mode: "ALL" });
    expect(saved.participants).toHaveLength(3);
    expect(saved.participants[0]).toEqual({ student: S1, name: "Asha", grade: "Grade 5" });
  });

  it("refuses a chosen student who is not on the school's roster", async () => {
    await expect(saveRegistration(studentTraining, SCHOOL, { mode: "CHOSEN", participants: [S1, "65f0c0ffee0000000000ffff"] }))
      .rejects.toThrow("not an active member of your school");
  });

  it("registers chosen teachers for a teacher training, and never by grade", async () => {
    const saved = await saveRegistration(teacherTraining, SCHOOL, { mode: "CHOSEN", participants: [T1] });
    expect(saved.participants).toEqual([{ teacher: T1, name: "Gita Rai", grade: "" }]);
    await expect(saveRegistration(teacherTraining, SCHOOL, { mode: "GRADES", grades: ["Grade 5"] }))
      .rejects.toThrow("Teachers are registered all together or one by one.");
  });

  it("refuses once registration is closed or the school's training is completed", async () => {
    await expect(saveRegistration({ ...studentTraining, status: "CLOSED" }, SCHOOL, { mode: "ALL" }))
      .rejects.toThrow("Registration for this training is closed.");
    TrainingRegistration.findOne.mockResolvedValue({ status: "COMPLETED" });
    await expect(saveRegistration(studentTraining, SCHOOL, { mode: "ALL" })).rejects.toThrow("already completed");
  });
});

describe("completeRegistration", () => {
  it("issues one teacher certificate per participant, dated the training day", async () => {
    const registration = {
      _id: "65f0c0ffee0000000000e001",
      school: { _id: SCHOOL, schoolName: "Green Villege" },
      participants: [{ teacher: T1, name: "Gita Rai", grade: "" }],
      save: jest.fn(),
    };
    const issued = await completeRegistration(teacherTraining, registration, { trainingDate: "2026-11-06", actorId: "admin" });

    expect(issued).toBe(1);
    expect(Achievement.deleteMany).toHaveBeenCalledWith({ trainingRegistration: registration._id });
    const [doc] = Achievement.insertMany.mock.calls[0][0];
    expect(doc).toMatchObject({
      school: SCHOOL,
      teacher: T1,
      student: null,
      recipientType: "TEACHER",
      training: teacherTraining._id,
      placement: "PARTICIPANT",
      certificateRecipientName: "Gita Rai",
      certificateState: "CERTIFICATE_ACTIVE",
      isPublic: false,
    });
    expect(doc.certificateUrl).toBe(`/certificates/${doc._id}`);
    expect(doc.awardedAt.toISOString()).toBe("2026-11-06T06:15:00.000Z");
    expect(registration.status).toBe("COMPLETED");
    expect(registration.save).toHaveBeenCalled();
  });

  it("refuses a draft training or an empty list", async () => {
    await expect(completeRegistration({ ...studentTraining, status: "DRAFT" }, { participants: [{}] }, {}))
      .rejects.toThrow("Publish the training first.");
    await expect(completeRegistration(studentTraining, { participants: [] }, {})).rejects.toThrow("no participants");
  });
});
