/**
 * Generate a strong random password.
 * Format: RandomWord + 4 digits + special char
 * Example: butterfly1234!
 */
export function generateStrongPassword() {
  const adjectives = [
    "bright",
    "swift",
    "quick",
    "fresh",
    "calm",
    "bold",
    "keen",
    "wise",
    "kind",
    "clear",
  ];
  const nouns = [
    "eagle",
    "tiger",
    "river",
    "forest",
    "ocean",
    "stone",
    "star",
    "cloud",
    "flame",
    "wave",
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  const special = ["!", "@", "#", "$", "%"][Math.floor(Math.random() * 5)];

  return `${adj}${noun}${num}${special}`;
}

/**
 * Every student starts with this password: on registration (single or bulk),
 * when the school resets it, and when credentials are repaired. The student
 * then changes it from their own account (/student/account). Students sign in
 * with their IEMIS number, so the shared starting password is paired with an
 * identifier only they and their school hold.
 */
export const DEFAULT_STUDENT_PASSWORD = "password@123";
