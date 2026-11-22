jest.mock("@/lib/routeHandler", () => ({ defineRoute: (_options, handler) => handler }));
jest.mock("@/models/MagazineIssue", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock("@/lib/magazineIssues", () => ({
  serializeMagazineIssue: jest.fn((issue) => ({ id: String(issue._id), title: issue.title })),
}));
jest.mock("@/lib/teacherMagazineDesk", () => ({ getTeacherMagazineScope: jest.fn() }));

import MagazineIssue from "@/models/MagazineIssue";
import { getTeacherMagazineScope } from "@/lib/teacherMagazineDesk";
import { GET } from "@/app/api/teacher/magazine-issues/route";

describe("teacher magazine issue access", () => {
  it("returns only writing-open and published magazines for a class teacher", async () => {
    getTeacherMagazineScope.mockResolvedValue({ school: "school-1" });
    MagazineIssue.find.mockReturnValue({
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    });

    const response = await GET({ session: { user: { id: "teacher-1", role: "TEACHER" } } });

    expect(response.status).toBe(200);
    expect(MagazineIssue.find).toHaveBeenCalledWith({
      school: "school-1",
      $or: [
        { status: "DRAFT", acceptingSubmissions: true },
        { status: "PUBLISHED" },
      ],
    });
  });
});
