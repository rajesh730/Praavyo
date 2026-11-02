const INVALID_CREDENTIALS = new Set([
  "CredentialsSignin",
  "Invalid password",
  "No user found with this email/username",
]);

const ACCOUNT_MESSAGES = new Set([
  "Your account is pending approval.",
  "Your account has been rejected.",
  "Your account is inactive.",
  "Your profile is inactive or unavailable.",
  "Your teacher account is not active at any school. Contact your school.",
]);

export function authErrorMessage(code) {
  if (INVALID_CREDENTIALS.has(code)) {
    return "Wrong username, email or password. Please check and try again.";
  }
  if (ACCOUNT_MESSAGES.has(code)) return code;
  // The server already words this one for people, with the wait in minutes.
  if (String(code || "").startsWith("Too many login attempts")) return code;
  return "Sign-in is temporarily unavailable. Please try again shortly.";
}
