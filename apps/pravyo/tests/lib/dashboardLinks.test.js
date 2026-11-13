import {
  isSignedInAreaPath,
  resolveDashboardLink,
} from "@/lib/dashboardLinks";

const origin = "https://www.praavyo.com";
const resolve = (href, role = "SCHOOL_ADMIN", currentPath = "/school/dashboard") =>
  resolveDashboardLink(href, { role, origin, currentPath });

describe("dashboardLinks — signed-in people stay inside the dashboard", () => {
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

  it("downloads a certificate PDF in place", () => {
    expect(resolve("/certificates/abc?download=pdf")).toEqual({
      action: "download",
      href: "/certificates/abc?download=pdf",
    });
  });

  it("opens every other public page in the viewer", () => {
    expect(resolve("/trainings/t1")).toEqual({ action: "viewer", href: "/trainings/t1", title: "Training" });
    expect(resolve("/verify?code=EGT-2026-ABC")).toMatchObject({ action: "viewer", title: "Verify certificate" });
    expect(resolve("/schools/s1#inquiry")).toMatchObject({ action: "viewer", href: "/schools/s1#inquiry" });
    expect(resolve("/students/st1")).toMatchObject({ action: "viewer", title: "Student profile" });
    expect(resolve("/writings/w1")).toMatchObject({ action: "viewer", title: "Writing" });
    expect(resolve("/winners")).toMatchObject({ action: "viewer" });
    expect(resolve("/events")).toMatchObject({ action: "viewer", title: "Event" });
  });

  it("sends a public event page to the role's own event screen", () => {
    expect(resolve("/events/e1", "STUDENT")).toEqual({ action: "navigate", href: "/student/events/e1" });
    expect(resolve("/events/e1", "SUPER_ADMIN")).toEqual({ action: "navigate", href: "/admin/events/e1/manage" });
    expect(resolve("/events/e1", "SCHOOL_ADMIN")).toEqual({ action: "navigate", href: "/school/dashboard?tab=platform-events" });
    expect(resolve("/events/e1", "TEACHER")).toEqual({ action: "navigate", href: "/teacher/dashboard?tab=events" });
    expect(resolve("/events/e1", "PARENT")).toEqual({ action: "navigate", href: "/parent/events" });
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
