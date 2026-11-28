jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/SchoolConfig", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SchoolAdmission", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import { parseAdmissionSettings, serializeAdmission } from "@/lib/schoolAdmission";

const GRADES = ["Grade 1", "Grade 2", "Grade 3"];

describe("parseAdmissionSettings", () => {
  it("accepts an open season with chosen grades, a last date and instructions", () => {
    const { data, error } = parseAdmissionSettings(
      { isOpen: true, academicYear: " 2083  BS ", grades: ["Grade 1", "Grade 1", "Grade 3"], deadline: "2026-12-30", note: " Bring the birth certificate. " },
      GRADES
    );
    expect(error).toBeUndefined();
    expect(data).toEqual({
      isOpen: true,
      academicYear: "2083 BS",
      grades: ["Grade 1", "Grade 3"],
      deadline: new Date("2026-12-30"),
      note: "Bring the birth certificate.",
    });
  });

  it("only opens on an explicit true", () => {
    expect(parseAdmissionSettings({ isOpen: "yes" }, GRADES).data.isOpen).toBe(false);
  });

  it("refuses a grade the school does not run", () => {
    expect(parseAdmissionSettings({ isOpen: true, grades: ["Grade 9"] }, GRADES).error).toBe("Grade 9 is not a grade at your school.");
  });

  it("refuses a bad date and over-long text", () => {
    expect(parseAdmissionSettings({ deadline: "not a date" }, GRADES).error).toBe("Enter a valid last date.");
    expect(parseAdmissionSettings({ note: "x".repeat(1501) }, GRADES).error).toMatch(/under 1500/);
    expect(parseAdmissionSettings({ academicYear: "x".repeat(41) }, GRADES).error).toMatch(/too long/);
  });
});

describe("serializeAdmission", () => {
  it("opens every grade when none were chosen", () => {
    expect(serializeAdmission({ isOpen: true, grades: [] }, GRADES).grades).toEqual(GRADES);
  });

  it("keeps only chosen grades the school still runs", () => {
    expect(serializeAdmission({ isOpen: true, grades: ["Grade 2", "Grade 8"] }, GRADES).grades).toEqual(["Grade 2"]);
  });

  it("is closed when the school never set it up", () => {
    expect(serializeAdmission(null, GRADES)).toMatchObject({ isOpen: false, academicYear: "", note: "", deadline: null });
  });
});
