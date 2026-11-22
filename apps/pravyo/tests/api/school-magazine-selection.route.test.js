jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/SchoolMagazineArticle", () => ({ __esModule: true, default: { findOne: jest.fn(), updateOne: jest.fn() } }));
jest.mock("@/models/MagazineIssue", () => ({ __esModule: true, default: { findOne: jest.fn(), updateOne: jest.fn(), findById: jest.fn() } }));
jest.mock("@/lib/lifecycle", () => ({ recordLifecycleAudit: jest.fn() }));
jest.mock("@/lib/freeWritingDesk", () => ({ validateWritingEdit: jest.fn() }));
jest.mock("@/lib/magazineIssues", () => ({ getCurrentMagazineIssue: jest.fn(), serializeMagazineIssue: jest.fn() }));

import { requireApiSession } from "@/lib/authz";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import MagazineIssue from "@/models/MagazineIssue";
import { serializeMagazineIssue } from "@/lib/magazineIssues";
import { PATCH } from "@/app/api/school/magazine/[id]/route";

describe("school final magazine selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireApiSession.mockResolvedValue({ session: { user: { id: "school-1", role: "SCHOOL_ADMIN" } } });
    serializeMagazineIssue.mockImplementation((issue) => issue && { id: String(issue._id), title: issue.title });
  });

  it("lets only the school make the final selection for the student's chosen issue", async () => {
    const article = {
      _id: "article-3",
      school: "school-1",
      submissionSource: "MAGAZINE",
      requestedIssue: "issue-1",
      magazineIssue: null,
      isMagazinePublished: false,
      isPublished: false,
      status: "SUBMITTED",
      submittedAt: new Date(),
    };
    const issue = { _id: "issue-1", title: "Grade 3 Test Magazine" };
    SchoolMagazineArticle.findOne.mockResolvedValue(article);
    SchoolMagazineArticle.updateOne.mockResolvedValue({ matchedCount: 1 });
    MagazineIssue.findOne.mockResolvedValue(issue);
    MagazineIssue.updateOne.mockResolvedValue({ matchedCount: 1 });

    const response = await PATCH(
      new Request("http://localhost/api/school/magazine/article-3", {
        method: "PATCH",
        body: JSON.stringify({ action: "PUBLISH_MAGAZINE", magazineIssueId: "issue-1" }),
      }),
      { params: Promise.resolve({ id: "article-3" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.article.isMagazinePublished).toBe(true);
    expect(SchoolMagazineArticle.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ isMagazinePublished: true, magazineIssue: "issue-1" }) }),
    );
    expect(MagazineIssue.updateOne).toHaveBeenCalledWith(
      { _id: "issue-1" },
      { $addToSet: { articles: "article-3" } },
    );
  });
});
