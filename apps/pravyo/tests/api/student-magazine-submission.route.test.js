jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/Student", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SchoolMagazineArticle", () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock("@/lib/workIndicatorRealtime", () => ({ publishWorkIndicatorsUpdate: jest.fn() }));
jest.mock("@/lib/magazineNotifications", () => ({ notifySchoolMagazineSubmitted: jest.fn() }));
jest.mock("@/lib/writingCategories", () => ({
  normalizeSubmissionSource: jest.fn(() => "MAGAZINE"),
  normalizeWritingCategory: jest.fn(() => "POEM"),
}));
jest.mock("@/lib/magazineIssues", () => ({ findOpenMagazineIssue: jest.fn() }));
jest.mock("@/lib/studentEnrollment", () => ({ buildAuthoredEraSnapshot: jest.fn(() => ({})) }));
jest.mock("@/lib/studentIdentity", () => ({ buildStudentLookupForSession: jest.fn(() => ({ _id: "student-3" })) }));
jest.mock("@/lib/writingMedia", () => ({
  cleanupRemovedWritingMedia: jest.fn(),
  resolveWritingCover: jest.fn(async () => null),
  resolveWritingImages: jest.fn(async () => []),
}));
jest.mock("@/lib/writingTags", () => ({ normalizeWritingTags: jest.fn(() => []) }));
jest.mock("@/lib/studentWritings", () => ({ WAITING_FOR_SCHOOL: "Waiting" }));

import { requireApiSession } from "@/lib/authz";
import Student from "@/models/Student";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { findOpenMagazineIssue } from "@/lib/magazineIssues";
import { notifySchoolMagazineSubmitted } from "@/lib/magazineNotifications";
import { POST } from "@/app/api/student/writings/route";

const student = { _id: "student-3", school: "school-1", grade: "Grade 3", name: "Grade Three Writer" };

function submitRequest() {
  return new Request("http://localhost/api/student/writings", {
    method: "POST",
    body: JSON.stringify({
      title: "My Grade 3 Test Story",
      content: "A test submission for the school magazine.",
      category: "POEM",
      submissionSource: "MAGAZINE",
      requestedIssue: "issue-1",
      status: "SUBMITTED",
    }),
  });
}

describe("Grade 3 magazine submission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireApiSession.mockResolvedValue({ session: { user: { id: "account-3", role: "STUDENT" } } });
    Student.findOne.mockReturnValue({ select: () => ({ lean: async () => student }) });
  });

  it("sends Grade 3 work only to the selected open magazine and notifies reviewers", async () => {
    const article = { _id: "article-3", submissionSource: "MAGAZINE", requestedIssue: "issue-1", status: "SUBMITTED" };
    findOpenMagazineIssue.mockResolvedValue({ _id: "issue-1" });
    SchoolMagazineArticle.create.mockResolvedValue(article);

    const response = await POST(submitRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toBe("Sent to the school magazine");
    expect(SchoolMagazineArticle.create).toHaveBeenCalledWith(expect.objectContaining({
      authorStudent: "student-3",
      school: "school-1",
      submissionSource: "MAGAZINE",
      requestedIssue: "issue-1",
      showOnSchoolWall: false,
    }));
    expect(notifySchoolMagazineSubmitted).toHaveBeenCalledWith(expect.objectContaining({ article, student, schoolId: "school-1" }));
  });

  it("refuses a Grade 3 submission when that magazine is closed", async () => {
    findOpenMagazineIssue.mockResolvedValue(null);

    const response = await POST(submitRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/open for writing/i);
    expect(SchoolMagazineArticle.create).not.toHaveBeenCalled();
  });
});
