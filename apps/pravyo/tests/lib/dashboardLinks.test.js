import {
  dashboardHrefForPublicPath,
  isPublicPagePath,
  isSignedInAreaPath,
  resolveDashboardLink,
} from "@/lib/dashboardLinks";

const origin = "https://www.praavyo.com";
const SCHOOL_ID = "school123";
const resolve = (href, role = "SCHOOL_ADMIN", currentPath = "/school/dashboard") =>
  resolveDashboardLink(href, { role, userId: SCHOOL_ID, origin, currentPath });

describe("dashboardLinks — signed-in people never see the public site", () => {
  it("knows which screens are the signed-in app", () => {
    expect(isSignedInAreaPath("/school/dashboard")).toBe(true);
    expect(isSignedInAreaPath("/school/cas/student-result")).toBe(true);
    expect(isSignedInAreaPath("/parent/child")).toBe(true);
    expect(isSignedInAreaPath("/teacher/dashboard")).toBe(true);
    expect(isSignedInAreaPath("/parent/login")).toBe(false);
    expect(isSignedInAreaPath("/student/login")).toBe(false);
    expect(isSignedInAreaPath("/trainings/abc")).toBe(false);
    expect(isSignedInAreaPath("/schoolsomething")).toBe(false);
  });

  it("knows which paths are public pages (and that dashboards and documents are not)", () => {
    expect(isPublicPagePath("/trainings")).toBe(true);
    expect(isPublicPagePath("/trainings/t1")).toBe(true);
    expect(isPublicPagePath("/students/st1")).toBe(true);
    expect(isPublicPagePath("/student/journey")).toBe(false);
    expect(isPublicPagePath("/schools")).toBe(true);
    expect(isPublicPagePath("/school/dashboard")).toBe(false);
    expect(isPublicPagePath("/certificates/c1")).toBe(false);
    expect(isPublicPagePath("/verify")).toBe(false);
    expect(isPublicPagePath("/")).toBe(false);
  });

  it("opens a certificate in the viewer, embedded", () => {
    expect(resolve("/certificates/abc123")).toEqual({
      action: "viewer",
      href: "/certificates/abc123?embed=1",
      title: "Certificate",
    });
    expect(resolve(`${origin}/certificates/bulk?ids=a,b`)).toEqual({
      action: "viewer",
      href: "/certificates/bulk?ids=a%2Cb&embed=1",
      title: "Certificates",
    });
    expect(resolve("/certificates/abc?preview=1").href).toBe("/certificates/abc?preview=1&embed=1");
  });

  it("verifies a certificate in the viewer, embedded (no public navigation)", () => {
    expect(resolve("/verify?code=EGT-2026-ABC", "PARENT", "/parent/journey")).toEqual({
      action: "viewer",
      href: "/verify?code=EGT-2026-ABC&embed=1",
      title: "Verify certificate",
    });
  });

  it("downloads a certificate PDF in place", () => {
    expect(resolve("/certificates/abc?download=pdf")).toEqual({
      action: "download",
      href: "/certificates/abc?download=pdf",
    });
  });

  it("sends trainings to each role's own trainings screen", () => {
    expect(resolve("/trainings/t1")).toEqual({ action: "navigate", href: "/school/dashboard?tab=platform-events&kind=trainings" });
    expect(resolve("/trainings", "SUPER_ADMIN")).toEqual({ action: "navigate", href: "/admin/dashboard?tab=events&kind=trainings" });
    expect(resolve("/trainings/t1", "TEACHER")).toEqual({ action: "navigate", href: "/teacher/dashboard" });
    expect(resolve("/trainings/t1", "STUDENT")).toEqual({ action: "navigate", href: "/student/journey" });
    expect(resolve("/trainings/t1", "PARENT")).toEqual({ action: "navigate", href: "/parent/child" });
  });

  it("sends a public event page to the role's own event screen", () => {
    expect(resolve("/events/e1", "STUDENT")).toEqual({ action: "navigate", href: "/student/events/e1" });
    expect(resolve("/events/e1", "SUPER_ADMIN")).toEqual({ action: "navigate", href: "/admin/events/e1/manage" });
    expect(resolve("/events/e1", "SCHOOL_ADMIN")).toEqual({ action: "navigate", href: "/school/dashboard?tab=platform-events" });
    expect(resolve("/events/e1", "TEACHER")).toEqual({ action: "navigate", href: "/teacher/dashboard?tab=events" });
    expect(resolve("/events/e1", "PARENT")).toEqual({ action: "navigate", href: "/parent/events" });
    expect(resolve("/events", "STUDENT")).toEqual({ action: "navigate", href: "/student/events" });
    expect(resolve("/winners", "PARENT")).toEqual({ action: "navigate", href: "/parent/events" });
  });

  it("sends the school's own public page to Public Profile, and its inquiry form to Inquiries", () => {
    expect(resolve(`/schools/${SCHOOL_ID}`)).toEqual({ action: "navigate", href: "/school/dashboard?tab=showcase" });
    expect(resolve(`/schools/${SCHOOL_ID}#inquiry`)).toEqual({ action: "navigate", href: "/school/dashboard?tab=inquiries" });
    expect(resolve("/schools/another-school")).toEqual({ action: "navigate", href: "/school/dashboard" });
    expect(resolve("/schools", "STUDENT")).toEqual({ action: "navigate", href: "/student/dashboard" });
  });

  it("opens student profiles, writing and magazines inside the role's dashboard", () => {
    expect(resolve("/students/st1", "STUDENT")).toEqual({ action: "navigate", href: "/student/journey" });
    expect(resolve("/students/st1", "PARENT")).toEqual({ action: "navigate", href: "/parent/child" });
    expect(resolve("/students/st1")).toEqual({ action: "navigate", href: "/school/dashboard?tab=students" });
    expect(resolve("/students/st1", "TEACHER")).toEqual({ action: "navigate", href: "/teacher/dashboard?tab=students" });
    expect(resolve("/writings/w1", "STUDENT")).toEqual({ action: "navigate", href: "/student/school-wall/w1" });
    expect(resolve("/writings/w1")).toEqual({ action: "navigate", href: "/school/dashboard?tab=magazine" });
    expect(resolve("/writings/w1", "PARENT")).toEqual({ action: "navigate", href: "/parent/journey" });
    expect(resolve("/magazines/i1", "STUDENT")).toEqual({ action: "navigate", href: "/student/magazine/issues/i1" });
    expect(resolve("/magazines/i1/articles/a1", "STUDENT")).toEqual({ action: "navigate", href: "/student/magazine/a1" });
    expect(resolve("/magazines/i1")).toEqual({ action: "navigate", href: "/school/dashboard?tab=magazine" });
  });

  it("sends notices, search and other public pages to the role's own screens", () => {
    expect(resolve("/notices", "STUDENT")).toEqual({ action: "navigate", href: "/student/notices" });
    expect(resolve("/notices", "PARENT")).toEqual({ action: "navigate", href: "/parent/notices" });
    expect(resolve("/search?q=x", "TEACHER")).toEqual({ action: "navigate", href: "/teacher/dashboard" });
    expect(resolve("/student-voices", "STUDENT")).toEqual({ action: "navigate", href: "/student/dashboard" });
    expect(resolve("/privacy", "PARENT")).toEqual({ action: "navigate", href: "/parent" });
  });

  it("never returns a public page as a destination", () => {
    const roles = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"];
    const pages = [
      "/events", "/events/e1", "/trainings", "/trainings/t1", "/schools", `/schools/${SCHOOL_ID}`,
      "/students/s1", "/writings/w1", "/magazines/m1", "/magazines/m1/articles/a1",
      "/winners", "/notices", "/search", "/student-voices",
    ];
    for (const role of roles) {
      for (const page of pages) {
        const target = dashboardHrefForPublicPath(page, { role, userId: SCHOOL_ID });
        expect(target).toBeTruthy();
        expect(isPublicPagePath(new URL(target, origin).pathname)).toBe(false);
      }
    }
  });

  it("leaves dashboard links, auth screens, other sites and same-page hashes alone", () => {
    expect(resolve("/school/certificates")).toEqual({ action: "navigate", href: "/school/certificates" });
    expect(resolve("/")).toEqual({ action: "navigate", href: "/" });
    expect(resolve("/api/school/certificates")).toBeNull();
    expect(resolve("/login")).toBeNull();
    expect(resolve("https://example.com/page")).toBeNull();
    expect(resolve("/school/dashboard#top")).toBeNull();
    expect(resolve("")).toBeNull();
  });
});
