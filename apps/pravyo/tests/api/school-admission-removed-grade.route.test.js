jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/models/SchoolAdmission", () => ({ __esModule: true, default: { findOneAndUpdate: jest.fn() } }));
jest.mock("@/lib/schoolAdmission", () => {
  const actual = jest.requireActual("@/lib/schoolAdmission");
  return { ...actual, getAdmissionSeason: jest.fn() };
});

import { getServerSession } from "next-auth";
import SchoolAdmission from "@/models/SchoolAdmission";
import { getAdmissionSeason } from "@/lib/schoolAdmission";
import { PUT } from "@/app/api/school/admission/route";

/**
 * A grade removed in Settings → Grades keeps its place in the admission list,
 * so adding the grade back brings its admission setting back too.
 */

const put = (body) => PUT(new Request("http://localhost/api/school/admission", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({ user: { id: "65f0c0ffee0000000000abcd", role: "SCHOOL_ADMIN" } });
  // UKG was taking applications, then the school removed UKG.
  getAdmissionSeason.mockResolvedValue({
    row: { isOpen: true, grades: ["UKG", "Grade 1"] },
    schoolGrades: ["Grade 1", "Grade 2"],
  });
  SchoolAdmission.findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve({ isOpen: true, grades: ["Grade 1", "UKG"] }) });
});

it("keeps a removed grade in the chosen list when settings are saved", async () => {
  const res = await put({ isOpen: true, grades: ["Grade 1"] });
  expect(res.status).toBe(200);
  const update = SchoolAdmission.findOneAndUpdate.mock.calls[0][1].$set;
  expect(update.grades).toEqual(["Grade 1", "UKG"]);
  // The screen still shows only grades the school offers now.
  expect((await res.json()).data.settings.grades).toEqual(["Grade 1"]);
});

it("does not turn 'every grade' into 'only the removed grade'", async () => {
  await put({ isOpen: true, grades: [] });
  expect(SchoolAdmission.findOneAndUpdate.mock.calls[0][1].$set.grades).toEqual([]);
});
