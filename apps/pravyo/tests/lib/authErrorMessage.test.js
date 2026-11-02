import { authErrorMessage } from "@/lib/authErrorMessage";

describe("authErrorMessage", () => {
  test("keeps bad credentials distinct from service failures", () => {
    expect(authErrorMessage("Invalid password")).toMatch(/Wrong username, email or password/);
    expect(authErrorMessage("No user found with this email/username")).toMatch(/Wrong username, email or password/);
    expect(authErrorMessage("AUTH_SERVICE_UNAVAILABLE")).toMatch(/temporarily unavailable/);
    expect(authErrorMessage("querySrv ENOTFOUND internal-host")).toMatch(/temporarily unavailable/);
  });

  test("shows known account eligibility messages", () => {
    expect(authErrorMessage("Your account is pending approval.")).toBe("Your account is pending approval.");
    expect(authErrorMessage("Your teacher account is not active at any school. Contact your school."))
      .toMatch(/not active at any school/);
  });

  test("passes the rate-limit wait through instead of blaming the service", () => {
    expect(authErrorMessage("Too many login attempts. Try again in 4 minutes."))
      .toBe("Too many login attempts. Try again in 4 minutes.");
  });
});
