jest.mock("@/lib/websiteApiAuth", () => ({
  requireWebsiteApiKey: jest.fn(),
  websitePagination: jest.fn(() => ({ page: 1, limit: 12, skip: 0 })),
  paginatedData: jest.fn(),
}));
jest.mock("@/lib/inquiryIntake", () => ({ receiveInquiry: jest.fn() }));
jest.mock("@/lib/schoolAdmission", () => ({ getAdmissionSeason: jest.fn() }));

import { requireWebsiteApiKey } from "@/lib/websiteApiAuth";
import { receiveInquiry } from "@/lib/inquiryIntake";
import { getAdmissionSeason } from "@/lib/schoolAdmission";
import { GET, POST } from "@/app/api/v1/website/[resource]/route";
import { GET as GET_DETAIL } from "@/app/api/v1/website/[resource]/[id]/route";

const SCHOOL_ID = "65f0c0ffee0000000000abcd";
const KEY_ID = "65f0c0ffee0000000000eeee";

const call = (handler, method, resource, { body, headers = {}, id } = {}) =>
  handler(
    new Request(`https://www.praavyo.com/api/v1/website/${resource}${id ? `/${id}` : ""}`, {
      method,
      headers: { authorization: "Bearer prv_school_live_x", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ resource, id }) }
  );

beforeEach(() => {
  jest.clearAllMocks();
  requireWebsiteApiKey.mockResolvedValue({ schoolId: SCHOOL_ID, apiKey: { _id: KEY_ID } });
});

describe("Website API", () => {
  it("passes an inquiry from the school's website to the intake as source WEBSITE, per visitor", async () => {
    receiveInquiry.mockResolvedValue({ status: 201, message: "Inquiry sent" });
    const body = { type: "GENERAL", name: "Sita" };
    const res = await call(POST, "POST", "inquiries", { body, headers: { "x-visitor-ip": "27.34.1.2" } });
    expect(res.status).toBe(201);
    expect(receiveInquiry).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      body,
      source: "WEBSITE",
      visitor: `website:${KEY_ID}:27.34.1.2`,
      visitorMax: 5,
    });
  });

  it("shares a larger limit across the website when it does not send the visitor's IP", async () => {
    receiveInquiry.mockResolvedValue({ status: 201, message: "Inquiry sent" });
    await call(POST, "POST", "inquiries", { body: { name: "x" } });
    expect(receiveInquiry).toHaveBeenCalledWith(expect.objectContaining({ visitor: `website:${KEY_ID}`, visitorMax: 60 }));
  });

  it("passes the intake's refusal through, e.g. a closed admission season", async () => {
    receiveInquiry.mockResolvedValue({ status: 409, code: "ADMISSION_CLOSED", message: "Admissions are closed at the moment." });
    const res = await call(POST, "POST", "inquiries", { body: { type: "ADMISSION" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, code: "ADMISSION_CLOSED" });
  });

  it("needs a valid key before anything is sent", async () => {
    requireWebsiteApiKey.mockResolvedValue({ error: new Response("{}", { status: 401 }) });
    const res = await call(POST, "POST", "inquiries", { body: { name: "x" } });
    expect(res.status).toBe(401);
    expect(receiveInquiry).not.toHaveBeenCalled();
  });

  it("accepts POST only on /inquiries", async () => {
    const res = await call(POST, "POST", "notices", { body: {} });
    expect(res.status).toBe(405);
    expect(requireWebsiteApiKey).not.toHaveBeenCalled();
  });

  it("serves the admission season and form, never cached", async () => {
    getAdmissionSeason.mockResolvedValue({
      season: { isOpen: true, academicYear: "2083", grades: ["Grade 1"], deadline: null, note: "", openedAt: null },
    });
    const res = await call(GET, "GET", "admission");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json.data).toMatchObject({ isOpen: true, grades: ["Grade 1"], form: { type: "ADMISSION" } });
    expect(json.data.form.fields.find((field) => field.name === "grade").options).toEqual(["Grade 1"]);
  });

  it("answers 404 for unknown resources and unknown detail types", async () => {
    expect((await call(GET, "GET", "students")).status).toBe(404);
    expect((await call(GET_DETAIL, "GET", "achievements", { id: SCHOOL_ID })).status).toBe(404);
  });

  it("answers 404 for a malformed detail id without querying", async () => {
    const res = await call(GET_DETAIL, "GET", "notices", { id: "not-an-id" });
    expect(res.status).toBe(404);
  });
});
