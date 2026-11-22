jest.mock("@/lib/routeHandler", () => ({ defineRoute: (_options, handler) => handler }));
jest.mock("@/models/MagazineIssue", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/SchoolMagazineArticle", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/lib/magazineIssues", () => ({
  serializeMagazineIssue: jest.fn((issue) => ({ id: String(issue._id), title: issue.title })),
}));
jest.mock("@/lib/teacherMagazineDesk", () => ({ getTeacherMagazineSchool: jest.fn() }));

import MagazineIssue from "@/models/MagazineIssue";
import SchoolMagazineArticle from "@/models/SchoolMagazineArticle";
import { getTeacherMagazineSchool } from "@/lib/teacherMagazineDesk";
import { GET } from "@/app/api/teacher/published-magazines/route";

describe("teacher published magazine library", () => {
  it("shows an active teacher only final published issues from their school", async () => {
    getTeacherMagazineSchool.mockResolvedValue("school-1");
    MagazineIssue.find.mockReturnValue({
      sort: () => ({ lean: async () => [{ _id: "issue-1", title: "August Magazine 1" }] }),
    });
    SchoolMagazineArticle.find.mockReturnValue({
      select: () => ({ sort: () => ({ lean: async () => [{ magazineIssue: "issue-1", title: "A poem" }] }) }),
    });

    const response = await GET({ session: { user: { id: "teacher-1", role: "TEACHER" } } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(MagazineIssue.find).toHaveBeenCalledWith({ school: "school-1", status: "PUBLISHED" });
    expect(SchoolMagazineArticle.find).toHaveBeenCalledWith(expect.objectContaining({
      school: "school-1",
      isMagazinePublished: true,
      isDeleted: { $ne: true },
    }));
    expect(body.issues).toEqual([expect.objectContaining({ id: "issue-1", articleCount: 1 })]);
  });
});
