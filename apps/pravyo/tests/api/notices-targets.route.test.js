jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/lib/noticeRealtime", () => ({ publishNoticeRealtimeEvent: jest.fn() }));
jest.mock("@/lib/notifications/service", () => ({ publishNoticeToParents: jest.fn() }));
jest.mock("@/lib/devicePush", () => ({ pushNoticePublished: jest.fn() }));
jest.mock("@/models/Student", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Notice", () => {
  const Notice = jest.fn(function Notice(doc) {
    Object.assign(this, doc);
    this.save = jest.fn().mockResolvedValue(this);
    this.populate = jest.fn().mockResolvedValue(this);
  });
  Notice.findById = jest.fn();
  return { __esModule: true, default: Notice };
});

import { getServerSession } from "next-auth";
import Notice from "@/models/Notice";
import Student from "@/models/Student";
import { publishNoticeToParents } from "@/lib/notifications/service";
import { POST } from "@/app/api/notices/route";
import { PATCH } from "@/app/api/notices/[id]/route";

/**
 * One Notices screen for the school: a notice can go to students, teachers
 * and/or parents, and can be narrowed to chosen families
 * (Notice.targetStudents): the children themselves, their guardians and the
 * teachers of their grades. Only students of the same school.
 */

const SCHOOL = "aaaaaaaaaaaaaaaaaaaaaaa1";
const STUDENT_A = "65f0c0ffee0000000000aaaa";
const STUDENT_B = "65f0c0ffee0000000000bbbb";
const NOTICE_ID = "65f0c0ffee0000000000c001";
const GRADE_OF = { [STUDENT_A]: "Grade 3", [STUDENT_B]: "Grade 5" };

const studentsFound = (ids) =>
  Student.find.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(ids.map((_id) => ({ _id, grade: GRADE_OF[_id] }))) }),
  });

const post = (body) =>
  POST(new Request("http://localhost/api/notices", { method: "POST", body: JSON.stringify(body) }), {});

const base = { title: "Parent meeting", content: "Please come on Friday at 10.", status: "PUBLISHED", scope: "SCHOOL" };

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: SCHOOL, role: "SCHOOL_ADMIN" } });
});

describe("POST /api/notices", () => {
  it("sends one notice to students, teachers and parents together", async () => {
    const res = await post({ ...base, targetAudience: { students: true, teachers: true, parents: true }, grades: ["Grade 3"] });
    expect(res.status).toBe(201);
    expect(Notice).toHaveBeenCalledWith(
      expect.objectContaining({
        targetAudience: { students: true, teachers: true, parents: true },
        grades: ["Grade 3"],
        targetStudents: [],
        school: SCHOOL,
      })
    );
    expect(publishNoticeToParents).toHaveBeenCalled();
  });

  it("saves chosen families on a parents-only notice", async () => {
    studentsFound([STUDENT_A, STUDENT_B]);
    const res = await post({
      ...base,
      targetAudience: { students: false, teachers: false, parents: true },
      targetStudents: [STUDENT_A, STUDENT_B, STUDENT_A],
    });
    expect(res.status).toBe(201);
    expect(Student.find).toHaveBeenCalledWith({ _id: { $in: [STUDENT_A, STUDENT_B] }, school: SCHOOL });
    expect(Notice).toHaveBeenCalledWith(expect.objectContaining({ targetStudents: [STUDENT_A, STUDENT_B] }));
  });

  it("sends chosen families to all three groups, with the grades taken from the children", async () => {
    studentsFound([STUDENT_A, STUDENT_B]);
    const res = await post({
      ...base,
      targetAudience: { students: true, teachers: true, parents: true },
      grades: [],
      targetStudents: [STUDENT_A, STUDENT_B],
    });
    expect(res.status).toBe(201);
    expect(Notice).toHaveBeenCalledWith(
      expect.objectContaining({
        targetAudience: { students: true, teachers: true, parents: true },
        targetStudents: [STUDENT_A, STUDENT_B],
        // Teachers of these grades receive it.
        grades: ["Grade 3", "Grade 5"],
      })
    );
  });

  it("refuses students of another school", async () => {
    studentsFound([STUDENT_A]);
    const res = await post({
      ...base,
      targetAudience: { students: false, teachers: false, parents: true },
      targetStudents: [STUDENT_A, STUDENT_B],
    });
    expect(res.status).toBe(400);
    expect(Notice).not.toHaveBeenCalled();
  });

  it("refuses a notice with nobody to receive it", async () => {
    const res = await post({ ...base, targetAudience: { students: false, teachers: false, parents: false } });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/notices/[id]", () => {
  const existing = (overrides = {}) => {
    const doc = {
      _id: NOTICE_ID,
      scope: "SCHOOL",
      school: SCHOOL,
      status: "PUBLISHED",
      targetAudience: { students: false, teachers: false, parents: true },
      targetStudents: [STUDENT_A],
      grades: [],
      save: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    Notice.findById.mockResolvedValue(doc);
    return doc;
  };
  const patch = (body) =>
    PATCH(new Request(`http://localhost/api/notices/${NOTICE_ID}`, { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: NOTICE_ID }),
    });

  it("keeps the chosen families when an older screen does not send them", async () => {
    const doc = existing();
    const res = await patch({ title: "Parent meeting", content: "Moved to 11." });
    expect(res.status).toBe(200);
    expect(doc.targetStudents).toEqual([STUDENT_A]);
  });

  it("clears chosen families when sent an empty list", async () => {
    const doc = existing();
    const res = await patch({ title: "T", content: "C", targetStudents: [] });
    expect(res.status).toBe(200);
    expect(doc.targetStudents).toEqual([]);
  });

  it("lets the school tick students and teachers on a chosen-families notice", async () => {
    studentsFound([STUDENT_A]);
    const doc = existing();
    const res = await patch({
      title: "T",
      content: "C",
      targetAudience: { students: true, teachers: true, parents: true },
      grades: [],
      targetStudents: [STUDENT_A],
    });
    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
    expect(doc.targetAudience).toEqual({ students: true, teachers: true, parents: true });
    expect(doc.grades).toEqual(["Grade 3"]);
  });
});

describe("excludedByChosenFamilies (student board)", () => {
  const { excludedByChosenFamilies } = jest.requireActual("@/lib/noticeTargets");

  it("shows a chosen-families notice only to those students", () => {
    const notice = { targetStudents: [STUDENT_A] };
    expect(excludedByChosenFamilies(notice, STUDENT_A)).toBe(false);
    expect(excludedByChosenFamilies(notice, STUDENT_B)).toBe(true);
  });

  it("leaves ordinary notices to the grade rules", () => {
    expect(excludedByChosenFamilies({ targetStudents: [] }, STUDENT_B)).toBe(false);
    expect(excludedByChosenFamilies({}, STUDENT_B)).toBe(false);
  });
});
