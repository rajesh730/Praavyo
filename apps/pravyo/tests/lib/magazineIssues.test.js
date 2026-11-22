jest.mock("@/models/MagazineIssue", () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));

import MagazineIssue from "@/models/MagazineIssue";
import { findOpenMagazineIssue, listOpenMagazineIssues, serializeMagazineIssue } from "@/lib/magazineIssues";

describe("open magazine issues", () => {
  it("lists only draft magazines explicitly opened for student writing", async () => {
    MagazineIssue.find.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    await listOpenMagazineIssues("school-1");
    expect(MagazineIssue.find).toHaveBeenCalledWith({
      school: "school-1",
      status: "DRAFT",
      acceptingSubmissions: true,
    });
  });

  it("will not resolve a closed draft as a valid student target", async () => {
    MagazineIssue.findOne.mockReturnValue({ lean: async () => null });
    await findOpenMagazineIssue("school-1", "507f1f77bcf86cd799439011");
    expect(MagazineIssue.findOne).toHaveBeenCalledWith({
      _id: "507f1f77bcf86cd799439011",
      school: "school-1",
      status: "DRAFT",
      acceptingSubmissions: true,
    });
  });

  it("exposes the separate writing state to the school dashboard", () => {
    const issue = serializeMagazineIssue({
      _id: "issue-1",
      title: "May Magazine 1",
      titleEdited: true,
      month: 5,
      year: 2026,
      weekNumber: 1,
      status: "DRAFT",
      acceptingSubmissions: true,
      writingOpenedAt: new Date("2026-05-01"),
    });
    expect(issue.acceptingSubmissions).toBe(true);
    expect(issue.writingOpenedAt).toEqual(new Date("2026-05-01"));
  });
});
