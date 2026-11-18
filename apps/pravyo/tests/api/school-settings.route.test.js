jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/authOptions", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => jest.fn());
jest.mock("@/lib/settingsAudit", () => ({
  recordSettingsAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));
jest.mock("@/models/SchoolConfig", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    exists: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock("@/models/Student", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));
jest.mock("@pravyo/db/models/TeacherMembership", () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import User from "@/models/User";
import SchoolConfig from "@/models/SchoolConfig";
import { PUT } from "@/app/api/school/settings/route";

function request(body) {
  return new Request("http://localhost/api/school/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockExistingRecords() {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: "school-1",
      schoolName: "Old School",
      email: "old@school.test",
    }),
  });
  SchoolConfig.findOne.mockResolvedValue({ schoolCode: "OLD" });
}

describe("school settings credentials and persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSession.mockResolvedValue({
      user: { id: "school-1", role: "SCHOOL_ADMIN" },
    });
    mockExistingRecords();
  });

  it("normalizes the login email and returns the persisted settings", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    User.findByIdAndUpdate.mockResolvedValue({
      schoolName: "New School",
      email: "admin@newschool.test",
      establishedYear: null,
    });
    SchoolConfig.findOneAndUpdate.mockResolvedValue({
      schoolCode: "NS-1",
      city: "Kathmandu",
      teacherRoles: ["Mentor"],
    });

    const response = await PUT(
      request({
        identity: {
          schoolName: " New School ",
          email: " Admin@NewSchool.Test ",
          establishedYear: "",
        },
        config: {
          schoolCode: " NS-1 ",
          city: " Kathmandu ",
          teacherRoles: ["Mentor"],
        },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "school-1",
      expect.objectContaining({
        schoolName: "New School",
        email: "admin@newschool.test",
        establishedYear: null,
      }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(json.data.identity.email).toBe("admin@newschool.test");
    expect(json.data.config.city).toBe("Kathmandu");
  });

  it("rejects an email already owned by another account", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: "school-2" }),
    });

    const response = await PUT(
      request({
        identity: {
          schoolName: "Old School",
          email: "taken@school.test",
        },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toMatch(/already in use/i);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("does not allow the school to erase its login email", async () => {
    const response = await PUT(
      request({ identity: { schoolName: "Old School", email: "  " } })
    );

    expect(response.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("updates only email when the request contains only email", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    User.findByIdAndUpdate.mockResolvedValue({
      schoolName: "Old School",
      email: "new@school.test",
      schoolPhone: "9800000000",
      establishedYear: 1995,
    });

    const response = await PUT(
      request({ identity: { email: " New@School.Test " } })
    );

    expect(response.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "school-1",
      { email: "new@school.test" },
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(SchoolConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("saves only the checked link from pasted Google Maps embed code", async () => {
    const link = "https://www.google.com/maps/embed?pb=!1m18!2d85.3364!3d27.7323";
    User.findByIdAndUpdate.mockResolvedValue({
      schoolName: "Old School",
      email: "old@school.test",
      schoolMapEmbedUrl: link,
    });

    const response = await PUT(
      request({
        identity: {
          mapEmbedUrl: `<iframe src="${link}" width="600" height="450" loading="lazy"></iframe>`,
        },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "school-1",
      { schoolMapEmbedUrl: link },
      expect.anything()
    );
    expect(json.data.identity.mapEmbedUrl).toBe(link);
    expect(revalidatePath).toHaveBeenCalledWith("/schools/school-1");
  });

  it("rejects a map that is not a Google Maps embed", async () => {
    const response = await PUT(
      request({ identity: { mapEmbedUrl: '<iframe src="https://evil.test/x"></iframe>' } })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/Google Maps embed/);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("normalizes and persists the school IEMIS number", async () => {
    SchoolConfig.findOneAndUpdate.mockResolvedValue({
      schoolCode: "OLD",
      iemisNumber: "IEMIS-2083-0001",
      teacherRoles: [],
    });

    const response = await PUT(
      request({ config: { iemisNumber: " iemis-2083-0001 " } })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(SchoolConfig.findOneAndUpdate).toHaveBeenCalledWith(
      { school: "school-1" },
      expect.objectContaining({ iemisNumber: "IEMIS-2083-0001" }),
      expect.objectContaining({ new: true, upsert: true, runValidators: true })
    );
    expect(json.data.config.iemisNumber).toBe("IEMIS-2083-0001");
  });

  it("lets a school without an IEMIS number save other settings and enter it later", async () => {
    SchoolConfig.findOneAndUpdate.mockResolvedValue({ schoolCode: "NEW", iemisNumber: "", teacherRoles: [] });
    const response = await PUT(request({ config: { schoolCode: "NEW", iemisNumber: "" } }));
    expect(response.status).toBe(200);
    expect(SchoolConfig.findOneAndUpdate).toHaveBeenCalledWith(
      { school: "school-1" },
      expect.not.objectContaining({ iemisNumber: expect.anything() }),
      expect.anything()
    );
  });

  it("refuses to clear a saved school IEMIS registration number", async () => {
    SchoolConfig.exists.mockResolvedValueOnce({ _id: "config-1" });
    const response = await PUT(request({ config: { iemisNumber: "  " } }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/IEMIS registration number is required/);
    expect(SchoolConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses an IEMIS registration number another school already holds", async () => {
    SchoolConfig.exists.mockResolvedValueOnce({ _id: "other" });
    const response = await PUT(request({ config: { iemisNumber: "IEMIS-2083-0001" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/already registered to another school/);
    expect(SchoolConfig.exists).toHaveBeenCalledWith({ iemisNumber: "IEMIS-2083-0001", school: { $ne: "school-1" } });
  });

  it("rejects invalid profile values even when client validation is bypassed", async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const response = await PUT(
      request({
        identity: {
          schoolName: "Old School",
          email: "admin@school.test",
          website: "javascript:alert(1)",
          establishedYear: "not-a-year",
        },
      })
    );

    expect(response.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
