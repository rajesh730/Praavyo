jest.mock("@/models/Student", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SchoolConfig", () => ({ __esModule: true, default: { exists: jest.fn() } }));

import Student from "@/models/Student";
import { checkStudentIemis } from "@/lib/iemisRegistry";

const found = (row) => ({ select: () => ({ lean: () => Promise.resolve(row) }) });

describe("student IEMIS number", () => {
  it("is compulsory", async () => {
    expect((await checkStudentIemis("  ")).error).toMatch(/Student IEMIS number is required/);
  });

  it("is normalised and accepted when no other student holds it", async () => {
    Student.findOne.mockReturnValueOnce(found(null));
    expect(await checkStudentIemis(" ab-123 ")).toEqual({ iemisNumber: "AB-123", error: "" });
  });

  it("is unique across the platform, ignoring the student's own record", async () => {
    Student.findOne.mockReturnValueOnce(found({ name: "Sita" }));
    expect((await checkStudentIemis("AB-123")).error).toMatch(/already registered to Sita/);
    Student.findOne.mockReturnValueOnce(found(null));
    await checkStudentIemis("AB-123", { exceptStudent: "s1" });
    expect(Student.findOne).toHaveBeenLastCalledWith({ iemisNumber: "AB-123", isDeleted: { $ne: true }, _id: { $ne: "s1" } });
  });

  it("rejects punctuation outside letters, digits and hyphens", async () => {
    expect((await checkStudentIemis("12/34")).error).toMatch(/letters, numbers, and hyphens/);
  });
});
