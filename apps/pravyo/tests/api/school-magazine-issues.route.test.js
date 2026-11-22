// after() runs once the response is sent; here the queued work is collected
// so each test can wait for it.
const mockAfterTasks = [];
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task) => { mockAfterTasks.push(Promise.resolve().then(task)); },
}));
const flushAfter = () => Promise.all(mockAfterTasks.splice(0));

jest.mock("@/lib/authz", () => ({ requireApiSession: jest.fn() }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/models/MagazineIssue", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
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
  setMagazineNoticeActive: jest.fn(),
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
  setMagazineNoticeActive,
} from "@/lib/magazineOpeningNotices";
import { PATCH, POST } from "@/app/api/school/magazine-issues/route";

const schoolSession = { user: { id: "school-1", role: "SCHOOL_ADMIN" } };
const draftIssue = () => ({
  _id: "issue-1",
  title: "Grade 3 Test Magazine",
  status: "DRAFT",
  acceptingSubmissions: false,
  writingOpenedAt: null,
  writingClosedAt: null,
  createdNotice: "notice-created",
  writingNotice: null,
  save: jest.fn(),
});
let issue;

describe("school magazine writing controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAfterTasks.length = 0;
    issue = draftIssue();
    announceMagazineIssueCreated.mockResolvedValue({ _id: "notice-created" });
    announceMagazineWritingOpen.mockResolvedValue({ _id: "notice-writing" });
    MagazineIssue.findOneAndUpdate.mockReturnValue({
      select: () => ({ lean: async () => ({ status: "DRAFT", acceptingSubmissions: true }) }),
    });
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
    await flushAfter();

    expect(response.status).toBe(200);
    expect(body.issue.acceptingSubmissions).toBe(false);
    expect(announceMagazineIssueCreated).toHaveBeenCalledWith({
      issue,
      schoolId: "school-1",
      authorId: "school-1",
    });
    expect(MagazineIssue.updateOne).toHaveBeenCalledWith({ _id: "issue-1" }, { $set: { createdNotice: "notice-created" } });
  });

  it("opens writing and sends the actionable writing notification", async () => {
    MagazineIssue.findOne.mockResolvedValue(issue);

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "OPEN_WRITING", issueId: "issue-1" }),
    }));
    const body = await response.json();
    await flushAfter();

    expect(response.status).toBe(200);
    expect(issue.acceptingSubmissions).toBe(true);
    expect(issue.save).toHaveBeenCalled();
    expect(body.issue.acceptingSubmissions).toBe(true);
    expect(announceMagazineWritingOpen).toHaveBeenCalledWith({
      issue,
      schoolId: "school-1",
      authorId: "school-1",
    });
    // "Writing is closed" is withdrawn; the new notice is remembered.
    expect(setMagazineNoticeActive).toHaveBeenCalledWith("notice-created", false);
    expect(MagazineIssue.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "issue-1", writingNotice: null },
      { $set: { writingNotice: "notice-writing" } },
      { new: true },
    );
  });

  it("re-shows the earlier notice instead of notifying everyone again on reopen", async () => {
    MagazineIssue.findOne.mockResolvedValue({ ...issue, writingNotice: "notice-writing", writingOpenedAt: new Date() });

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "OPEN_WRITING", issueId: "issue-1" }),
    }));
    await flushAfter();

    expect(response.status).toBe(200);
    expect(announceMagazineWritingOpen).not.toHaveBeenCalled();
    expect(setMagazineNoticeActive).toHaveBeenCalledWith("notice-writing", true);
  });

  it("withdraws the writing notice when writing closes", async () => {
    MagazineIssue.findOne.mockResolvedValue({ ...issue, acceptingSubmissions: true, writingNotice: "notice-writing" });

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "CLOSE_WRITING", issueId: "issue-1" }),
    }));
    await flushAfter();

    expect(response.status).toBe(200);
    expect(setMagazineNoticeActive).toHaveBeenCalledWith("notice-writing", false);
    expect(announceMagazineWritingOpen).not.toHaveBeenCalled();
  });

  it("unpublishes a magazine back to a closed draft, keeping its writing", async () => {
    const published = {
      _id: "issue-2",
      title: "Baisakh Magazine",
      status: "PUBLISHED",
      acceptingSubmissions: false,
      publishedAt: new Date("2026-11-01"),
      showOnHome: true,
      homeShownAt: new Date("2026-11-01"),
      save: jest.fn(),
    };
    MagazineIssue.findOne.mockResolvedValue(published);

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "UNPUBLISH", issueId: "issue-2" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(published).toMatchObject({
      status: "DRAFT",
      acceptingSubmissions: false,
      publishedAt: null,
      showOnHome: false,
      homeShownAt: null,
    });
    expect(published.save).toHaveBeenCalled();
    expect(body.issue.status).toBe("DRAFT");
  });

  it("refuses to unpublish a magazine that is not published", async () => {
    MagazineIssue.findOne.mockResolvedValue({ ...issue, status: "DRAFT", save: jest.fn() });

    const response = await PATCH(new Request("http://localhost/api/school/magazine-issues", {
      method: "PATCH",
      body: JSON.stringify({ action: "UNPUBLISH", issueId: "issue-1" }),
    }));

    expect(response.status).toBe(409);
  });
});
