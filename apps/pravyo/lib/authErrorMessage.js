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
]);

export function authErrorMessage(code) {
  if (INVALID_CREDENTIALS.has(code)) {
    return "Invalid credentials. Please check your email and password.";
  }
  if (ACCOUNT_MESSAGES.has(code)) return code;
  return "Sign-in is temporarily unavailable. Please try again shortly.";
}
