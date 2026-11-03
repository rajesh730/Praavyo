jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/Teacher", () => ({ __esModule: true, default: { find: jest.fn(), countDocuments: jest.fn() } }));
jest.mock("@/models/SchoolConfig", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@pravyo/db/models/TeacherMembership", () => ({ __esModule: true, default: { find: jest.fn(), distinct: jest.fn() } }));
jest.mock("@pravyo/db/models/TeacherTeachingAssignment", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/models/cas/CasSubject", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@pravyo/db/teacherMemberships", () => ({ backfillTeacherMemberships: jest.fn(async () => {}) }));

import { getServerSession } from "next-auth";
import Teacher from "@/models/Teacher";
import SchoolConfig from "@/models/SchoolConfig";
import TeacherMembership from "@pravyo/db/models/TeacherMembership";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import CasSubject from "@pravyo/db/models/cas/CasSubject";
import { GET as listTeachers } from "@/app/api/teachers/route";

const lean = (value) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
const chain = (value) => ({ select: () => chain(value), sort: () => chain(value), skip: () => chain(value), limit: () => chain(value), lean: async () => value });

// Asha: Grade 1 class teacher. Bina: Grade 2 English. Chandra: nothing, part time.
// Deepa: left, was Grade 1 English.
const memberships = [
  { teacher: "t-asha", status: "ACTIVE" },
  { teacher: "t-bina", status: "ACTIVE" },
  { teacher: "t-chandra", status: "INACTIVE", employmentType: "PART_TIME" },
  { teacher: "t-deepa", status: "LEFT", endedAssignments: [{ grade: "Grade 1", assignmentType: "SUBJECT_TEACHER", subjectTitle: "English" }] },
];

async function matched(query) {
  await listTeachers(new Request(`http://localhost/api/teachers?${new URLSearchParams(query)}`));
  return Teacher.countDocuments.mock.calls[0][0]._id.$in;
}

describe("teacher list filters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({ user: { id: "school-a", role: "SCHOOL_ADMIN" } });
    TeacherMembership.find.mockReturnValue(lean(memberships));
    TeacherMembership.distinct.mockResolvedValue([]);
    SchoolConfig.findOne.mockReturnValue(lean({ grades: ["Grade 1", "Grade 2"] }));
    CasSubject.find.mockReturnValue(lean([
      { _id: "s-eng1", grade: "Grade 1", titleEn: "English", status: "ACTIVE" },
      { _id: "s-eng2", grade: "Grade 2", titleEn: "English", status: "ACTIVE" },
    ]));
    TeacherTeachingAssignment.find.mockReturnValue(lean([
      { teacher: "t-asha", grade: "Grade 1", assignmentType: "CLASS_TEACHER", subject: null },
      { teacher: "t-bina", grade: "Grade 2", assignmentType: "SUBJECT_TEACHER", subject: "s-eng2" },
    ]));
    Teacher.countDocuments.mockResolvedValue(0);
    Teacher.find.mockReturnValue(chain([]));
  });

  it("filters by grade", async () => {
    expect(await matched({ grade: "Grade 1" })).toEqual(["t-asha"]);
  });

  it("filters by responsibility, including teachers with none", async () => {
    expect(await matched({ responsibility: "SUBJECT_TEACHER" })).toEqual(["t-bina"]);
    Teacher.countDocuments.mockClear();
    expect(await matched({ responsibility: "UNASSIGNED" })).toEqual(["t-chandra"]);
  });

  it("matches a subject title across grades, and left teachers on their snapshot", async () => {
    expect(await matched({ subject: "english", status: "ALL" })).toEqual(["t-bina", "t-deepa"]);
  });

  it("filters by employment type, treating a missing one as full time", async () => {
    expect(await matched({ employment: "PART_TIME" })).toEqual(["t-chandra"]);
    Teacher.countDocuments.mockClear();
    expect(await matched({ employment: "FULL_TIME" })).toEqual(["t-asha", "t-bina"]);
  });

  it("returns grades and subject titles for the filter choices", async () => {
    const res = await listTeachers(new Request("http://localhost/api/teachers"));
    const body = await res.json();
    expect(body.filterOptions).toEqual({
      grades: ["Grade 1", "Grade 2"],
      subjects: [{ title: "English", grades: ["Grade 1", "Grade 2"] }],
    });
  });
});
