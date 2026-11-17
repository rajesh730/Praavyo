import { teacherRedirectForSchoolPath } from "@/lib/teacherAreaRoutes";

// The /school area is the school admin's. A teacher who lands on a /school
// address goes to their own area instead, except for the shared pages.
describe("where a teacher goes for a /school address", () => {
  it.each([
    ["/school/cas/assessment", "/teacher/exams/cas"],
    ["/school/cas/student-progress", "/teacher/exams/cas/progress"],
    ["/school/cas/curriculum", "/teacher/exams/cas"],
    ["/school/internal-exam/marks", "/teacher/exams/internal"],
    ["/school/internal-exam/results", "/teacher/exams/internal"],
    ["/school/exams", "/teacher/dashboard?tab=exams"],
    ["/school/dashboard", "/teacher/dashboard"],
    ["/school/guardians", "/teacher/dashboard"],
    ["/school/settings", "/teacher/dashboard"],
    ["/school/register-student", "/teacher/dashboard"],
  ])("%s -> %s", (from, to) => {
    expect(teacherRedirectForSchoolPath(from)).toBe(to);
  });

  it.each([
    "/school/events/abc123/manage",
    "/school/messages",
  ])("may stay on the shared page %s", (path) => {
    expect(teacherRedirectForSchoolPath(path)).toBeNull();
  });

  it("does not match look-alike addresses", () => {
    expect(teacherRedirectForSchoolPath("/school/messagesX")).toBe("/teacher/dashboard");
    expect(teacherRedirectForSchoolPath("/schoolwork")).toBeNull();
  });
});
