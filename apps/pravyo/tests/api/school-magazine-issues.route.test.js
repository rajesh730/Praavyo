jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/MagazineIssue", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock("@/models/SchoolMagazineArticle", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));
jest.mock("@/lib/magazineIssues", () => ({
  getCurrentMagazineIssue: jest.fn(),
  getOrCreateCurrentMagazineIssue: jest.fn(),
  serializeMagazineIssue: jest.fn(),
}));
jest.mock("@/lib/magazineOpeningNotices", () => ({
  announceMagazineIssueCreated: jest.fn(),
  announceMagazineWritingOpen: jest.fn(),
}));
jest.mock("@/lib/workIndicatorRealtime", () => ({ publishWorkIndicatorsUpdate: jest.fn() }));

import { requireApiSession } from "@/lib/authz";
import MagazineIssue from "@/models/MagazineIssue";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import {
  getOrCreateCurrentMagazineIssue,
  serializeMagazineIssue,
} from "@/lib/magazineIssues";
import {
  announceMagazineIssueCreated,
  announceMagazineWritingOpen,
} from "@/lib/magazineOpeningNotices";
import { PATCH, POST } from "@/app/api/school/magazine-issues/route";

const schoolSession = { user: { id: "school-1", role: "SCHOOL_ADMIN" } };
const issue = {
  _id: "issue-1",
  title: "Grade 3 Test Magazine",
  status: "DRAFT",
  acceptingSubmissions: false,
  writingOpenedAt: null,
  writingClosedAt: null,
  save: jest.fn(),
};

describe("school magazine writing controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireApiSession.mockResolvedValue({ session: schoolSession });
    SchoolMagazineArticle.countDocuments.mockResolvedValue(0);
    serializeMagazineIssue.mockImplementation((value) => ({
      id: String(value._id),
      title: value.title,
      status: value.status,
      acceptingSubmissions: value.acceptingSubmissions,
    }));
  });

  it("creates a closed magazine and announces it to the school", async () => {
    getOrCreateCurrentMagazineIssue.mockResolvedValue(issue);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.issue.acceptingSubmissions).toBe(false);
    expect(announceMagazineIssueCreated).toHaveBeenCalledWith({
      issue,
      schoolId: "school-1",
      authorId: "school-1",
    });
  });

  it("opens writing and sends the actionable writing notification", async () => {
    MagazineIssue.findOne.mockResolvedValue(issue);

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "OPEN_WRITING", issueId: "issue-1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(issue.acceptingSubmissions).toBe(true);
    expect(issue.save).toHaveBeenCalled();
    expect(body.issue.acceptingSubmissions).toBe(true);
    expect(announceMagazineWritingOpen).toHaveBeenCalledWith({
      issue,
      schoolId: "school-1",
      authorId: "school-1",
    });
  });
});
