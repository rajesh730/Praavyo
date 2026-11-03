jest.mock("@pravyo/db/models/Teacher", () => ({ __esModule: true, default: { findById: jest.fn() } }));

import Teacher from "@pravyo/db/models/Teacher";
import { teacherCardToken, verifyTeacherCardToken } from "@pravyo/auth/teacherCardToken";

describe("teacher login card token", () => {
  const teacher = { _id: "64b7f0c2a1b2c3d4e5f60718", cardVersion: 0 };

  beforeAll(() => { process.env.NEXTAUTH_SECRET = "test-secret"; });

  it("signs the teacher in with a current card", async () => {
    Teacher.findById.mockResolvedValue(teacher);
    const result = await verifyTeacherCardToken(teacherCardToken(teacher));
    expect(result).toEqual({ ok: true, teacher });
  });

  it("stops accepting a card once the password is reset", async () => {
    const oldCard = teacherCardToken(teacher);
    Teacher.findById.mockResolvedValue({ ...teacher, cardVersion: 1 });
    expect(await verifyTeacherCardToken(oldCard)).toEqual({ ok: false });
  });

  it("rejects a forged or malformed token", async () => {
    Teacher.findById.mockResolvedValue(teacher);
    expect(await verifyTeacherCardToken(`${teacher._id}.${"A".repeat(32)}`)).toEqual({ ok: false });
    expect(await verifyTeacherCardToken("rajesh.pandey")).toEqual({ ok: false });
  });
});
