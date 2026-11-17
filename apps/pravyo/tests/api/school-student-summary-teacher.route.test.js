jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/Student", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Notice", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/parentJourney", () => ({ buildStudentJourney: jest.fn() }));
jest.mock("@pravyo/db/models/TeacherTeachingAssignment", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import { getServerSession } from "next-auth";
import Student from "@/models/Student";
import User from "@/models/User";
import Notice from "@/models/Notice";
import { buildStudentJourney } from "@/lib/parentJourney";
import TeacherTeachingAssignment from "@pravyo/db/models/TeacherTeachingAssignment";
import { GET } from "@/app/api/school/students/[id]/summary/route";

const SCHOOL = "507f1f77bcf86cd799439000";
const STUDENT_ID = "507f1f77bcf86cd799439011";
const chain = (value) => ({ select: () => chain(value), sort: () => chain(value), lean: async () => value });

function student(grade) {
  Student.findOne.mockReturnValue(chain({ _id: STUDENT_ID, name: "Sita", grade, school: SCHOOL, enrollments: [] }));
}
function teaches(...grades) {
  TeacherTeachingAssignment.find.mockReturnValue(chain(grades.map((grade) => ({ grade }))));
}
const call = () => GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: STUDENT_ID }) });

// A teacher sees summaries only for students in the grades they teach.
describe("student summary for a teacher", () => {
  beforeEach(() => {
    getServerSession.mockResolvedValue({ user: { id: "t1", role: "TEACHER", schoolId: SCHOOL } });
    User.findById.mockReturnValue(chain({ schoolName: "Green Villege" }));
    Notice.findOne.mockReturnValue(chain(null));
    buildStudentJourney.mockResolvedValue({ entries: [] });
  });

  it("is refused (as not found) for a student in a grade they do not teach", async () => {
    student("Grade 5");
    teaches("Grade 3");
    const response = await call();
    expect(response.status).toBe(404);
    expect(buildStudentJourney).not.toHaveBeenCalled();
  });

  it("is allowed for a student in a grade they teach, whatever the grade spelling", async () => {
    student("3");
    teaches("Grade 3");
    const response = await call();
    expect(response.status).toBe(200);
  });

  it("is refused for a teacher with no teaching assignment", async () => {
    student("Grade 3");
    teaches();
    expect((await call()).status).toBe(404);
  });

  it("does not limit the school admin", async () => {
    getServerSession.mockResolvedValue({ user: { id: SCHOOL, role: "SCHOOL_ADMIN" } });
    student("Grade 5");
    expect((await call()).status).toBe(200);
    expect(TeacherTeachingAssignment.find).not.toHaveBeenCalled();
  });
});
