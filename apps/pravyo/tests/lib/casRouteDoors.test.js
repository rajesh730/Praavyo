// The two assessment doors: the school's API (/api/cas/...) admits school
// admins only; the teacher's API (/api/teacher/exams/...) admits teachers only.
// Both run the same endpoint, so the data is shared but the door is not.
jest.mock("@pravyo/cas/lib/casAccess", () => {
  const actual = jest.requireActual("@pravyo/cas/lib/casAccess");
  return { ...actual, getActor: jest.fn() };
});

import { getActor } from "@pravyo/cas/lib/casAccess";
import { handler, teacherHandler } from "@pravyo/cas/lib/casRoute";

const SCHOOL = { id: "s1", role: "SCHOOL_ADMIN", school: "s1" };
const TEACHER = { id: "t1", role: "TEACHER", school: "s1" };

const endpoint = jest.fn(async ({ actor }) => ({ servedTo: actor.role }));
const request = (path) => new Request(`http://localhost${path}`);

async function call(route, path) {
  const response = await route(request(path), {});
  return { status: response.status, body: await response.json() };
}

describe("school assessment API (handler)", () => {
  const route = handler(endpoint);

  it("serves the school admin", async () => {
    getActor.mockResolvedValue(SCHOOL);
    const { status, body } = await call(route, "/api/cas/exams");
    expect(status).toBe(200);
    expect(body.data).toEqual({ servedTo: "SCHOOL_ADMIN" });
  });

  it("refuses a teacher, without running the endpoint", async () => {
    getActor.mockResolvedValue(TEACHER);
    const { status, body } = await call(route, "/api/cas/exams");
    expect(status).toBe(403);
    expect(body.error).toMatch(/own dashboard/);
    expect(endpoint).not.toHaveBeenCalled();
  });
});

describe("teacher assessment API (teacherHandler)", () => {
  const route = teacherHandler(endpoint);

  it("serves the teacher", async () => {
    getActor.mockResolvedValue(TEACHER);
    const { status, body } = await call(route, "/api/teacher/exams/cas/exams");
    expect(status).toBe(200);
    expect(body.data).toEqual({ servedTo: "TEACHER" });
  });

  it("refuses a school admin, without running the endpoint", async () => {
    getActor.mockResolvedValue(SCHOOL);
    const { status } = await call(route, "/api/teacher/exams/cas/exams");
    expect(status).toBe(403);
    expect(endpoint).not.toHaveBeenCalled();
  });

  it("passes a signed-out visitor's 401 through", async () => {
    const { HttpError } = jest.requireActual("@pravyo/cas/lib/casAccess");
    getActor.mockRejectedValue(new HttpError("Sign in with your Pravyo account", 401));
    const { status } = await call(route, "/api/teacher/exams/cas/exams");
    expect(status).toBe(401);
    expect(endpoint).not.toHaveBeenCalled();
  });
});
