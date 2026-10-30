import { authErrorMessage } from "@/lib/authErrorMessage";

describe("authErrorMessage", () => {
  test("keeps bad credentials distinct from service failures", () => {
    expect(authErrorMessage("Invalid password")).toMatch(/Invalid credentials/);
    expect(authErrorMessage("No user found with this email/username")).toMatch(/Invalid credentials/);
    expect(authErrorMessage("AUTH_SERVICE_UNAVAILABLE")).toMatch(/temporarily unavailable/);
    expect(authErrorMessage("querySrv ENOTFOUND internal-host")).toMatch(/temporarily unavailable/);
  });

  test("shows known account eligibility messages", () => {
    expect(authErrorMessage("Your account is pending approval.")).toBe("Your account is pending approval.");
  });
});
