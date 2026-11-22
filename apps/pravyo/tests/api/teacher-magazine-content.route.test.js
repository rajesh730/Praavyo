jest.mock("@/lib/routeHandler", () => ({ defineRoute: (_options, handler) => handler }));
jest.mock("@/models/SchoolMagazineArticle", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), updateOne: jest.fn() },
}));
jest.mock("@/models/MagazineIssue", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock("@/lib/teacherMagazineDesk", () => ({ getTeacherMagazineScope: jest.fn() }));
jest.mock("@/lib/lifecycle", () => ({ recordLifecycleAudit: jest.fn() }));

import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";
import { PATCH } from "@/app/api/teacher/magazine/[id]/route";

const ARTICLE_ID = "507f1f77bcf86cd799439011";
const ISSUE_ID = "507f1f77bcf86cd799439012";
const session = { user: { id: "teacher-1", schoolId: "school-1" } };

function article(overrides = {}) {
  return {
    _id: ARTICLE_ID,
    school: "school-1",
    authorStudent: "student-3",
    requestedIssue: ISSUE_ID,
    submissionSource: "MAGAZINE",
    status: "SUBMITTED",
    title: "My poem",
    content: "Words",
    category: "POEM",
    isMagazinePublished: false,
    classTeacherSelectedAt: null,
    ...overrides,
  };
}

function request(action) {
  return new Request(`http://localhost/api/teacher/magazine/${ARTICLE_ID}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

describe("class-teacher magazine selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getTeacherMagazineScope.mockResolvedValue({ school: "school-1", grades: ["Grade 3"], studentIds: ["student-3"] });
    MagazineIssue.findOne.mockResolvedValue({ _id: ISSUE_ID, status: "DRAFT", acceptingSubmissions: true });
    SchoolMagazineArticle.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it("marks only an assigned class student's submission ready for school review", async () => {
    SchoolMagazineArticle.findOne.mockResolvedValue(article());

    const response = await PATCH({ request: request("SELECT_FOR_SCHOOL"), params: { id: ARTICLE_ID }, session });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.article.classTeacherSelectedAt).toBeTruthy();
    expect(SchoolMagazineArticle.findOne).toHaveBeenCalledWith(expect.objectContaining({
      school: "school-1",
      authorStudent: { $in: ["student-3"] },
    }));
    expect(MagazineIssue.findOne).toHaveBeenCalledWith(expect.objectContaining({
      status: "DRAFT",
      acceptingSubmissions: true,
    }));
    expect(SchoolMagazineArticle.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ isMagazinePublished: false }),
      expect.objectContaining({ $set: expect.objectContaining({ classTeacherSelectedBy: "teacher-1" }) }),
    );
  });

  it("refuses teacher changes when the issue is published or otherwise closed", async () => {
    SchoolMagazineArticle.findOne.mockResolvedValue(article());
    MagazineIssue.findOne.mockResolvedValue(null);

    await expect(PATCH({ request: request("SELECT_FOR_SCHOOL"), params: { id: ARTICLE_ID }, session }))
      .rejects.toMatchObject({ code: "MAGAZINE_CLOSED", status: 409 });
    expect(SchoolMagazineArticle.updateOne).not.toHaveBeenCalled();
  });

  it("refuses class-teacher changes after the school closes writing", async () => {
    SchoolMagazineArticle.findOne.mockResolvedValue(article());
    MagazineIssue.findOne.mockResolvedValue(null);

    await expect(PATCH({ request: request("SELECT_FOR_SCHOOL"), params: { id: ARTICLE_ID }, session }))
      .rejects.toMatchObject({ code: "MAGAZINE_CLOSED", status: 409 });
    expect(SchoolMagazineArticle.updateOne).not.toHaveBeenCalled();
  });

  it("refuses teacher changes after the school made its final selection", async () => {
    SchoolMagazineArticle.findOne.mockResolvedValue(article({ isMagazinePublished: true }));

    await expect(PATCH({ request: request("SELECT_FOR_SCHOOL"), params: { id: ARTICLE_ID }, session }))
      .rejects.toMatchObject({ code: "ALREADY_SELECTED_BY_SCHOOL", status: 409 });
    expect(SchoolMagazineArticle.updateOne).not.toHaveBeenCalled();
  });
});
