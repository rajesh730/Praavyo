import crypto from "crypto";

/**
 * Pravyo Parent ID (§2).
 *
 * A permanent, human-readable handle for a guardian account: `PRV-P-X7K4Q9`.
 *
 * Design constraints and why each one matters:
 *
 *  - **Random, not sequential, not derived.** Not from the Mongo ObjectId, not
 *    from a roll number, not from a counter. A guessable or enumerable ID would
 *    let anyone walk the guardian space, and §53 requires that knowing an ID
 *    reveals nothing.
 *  - **Unambiguous alphabet.** No O/0, I/1, or 5/S confusion. This ID gets read
 *    off a printed card, sometimes aloud over a phone, often by someone who is
 *    not confident with Latin characters. A mistyped ID must not silently
 *    resolve to a *different real guardian*.
 *  - **Case-insensitive.** Normalised on both write and read.
 *
 * The ID is an IDENTIFIER, never a credential. Authentication is always the
 * PIN. See lib/parentCredentials.js.
 */

// 32 characters, 6 positions => 32^6 ≈ 1.07 billion. With a realistic ceiling
// of a few hundred thousand guardians the space stays sparse enough that
// guessing a live ID is impractical, and the rate limiter closes the rest.
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_LENGTH = 6;
const ID_PREFIX = "PRV-P-";

/** Generate a candidate Parent ID. Uniqueness is enforced by the caller. */
export function generateParentIdCandidate() {
  const bytes = crypto.randomBytes(ID_LENGTH);
  let body = "";
  for (let i = 0; i < ID_LENGTH; i += 1) {
    body += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return `${ID_PREFIX}${body}`;
}

/**
 * Normalise anything a guardian might type into the canonical form.
 *
 * Accepts `prv-p-x7k4q9`, `PRVPX7K4Q9`, `prv p x7k4q9`, or bare `X7K4Q9` — all
 * resolve to `PRV-P-X7K4Q9`. A parent copying an ID off a card should not be
 * defeated by a missing hyphen.
 *
 * Returns "" when the input cannot be a valid ID, so callers can reject early
 * without hitting the database.
 */
export function normalizeParentId(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!raw) return "";

  // Tolerate the prefix being present, absent, or partially typed.
  const body = raw.startsWith("PRVP") ? raw.slice(4) : raw;

  if (body.length !== ID_LENGTH) return "";
  // Every character must be in the alphabet — this is what stops an ambiguous
  // character (O, I, 0, 1) resolving to something valid by accident.
  if (![...body].every((char) => ID_ALPHABET.includes(char))) return "";

  return `${ID_PREFIX}${body}`;
}

export function isValidParentIdFormat(value) {
  return normalizeParentId(value) !== "";
}

/**
 * Allocate a Parent ID that is not already taken.
 *
 * Collisions are vanishingly unlikely but must not be silently ignored — a
 * duplicate would mean two guardians sharing a login handle. Retries a handful
 * of times, then throws rather than returning something unsafe.
 */
export async function allocateParentId(ParentModel, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const candidate = generateParentIdCandidate();
    const existing = await ParentModel.exists({ parentId: candidate });
    if (!existing) return candidate;
  }
  throw new Error("Could not allocate a unique Parent ID");
}

/**
 * Give a parent document an ID if it has none.
 *
 * Extracted from the model's pre-save hook so it can be tested directly — a
 * hook buried in Mongoose middleware is exactly the kind of code that silently
 * stops firing and is never noticed until a column goes blank.
 *
 * Returns true when an ID was assigned, false when one was already present.
 */
export async function ensureParentId(doc, ParentModel) {
  if (!doc) return false;
  if (doc.parentId) return false;

  doc.parentId = await allocateParentId(ParentModel || doc.constructor);
  return true;
}

/**
 * Did this save fail because the Parent ID it carried is already taken?
 *
 * `allocateParentId` checks before it hands out an ID, but two schools saving
 * new guardians at the same instant could both pass that check with the same
 * random ID. The unique `parentId` index then rejects the second save (E11000);
 * that error is what this recognises, and only for `parentId`. A clash on any
 * other field (an email already in use, say) is a real problem and is never
 * retried.
 */
export function isParentIdClash(error) {
  if (error?.code !== 11000) return false;
  if (error.keyPattern && "parentId" in error.keyPattern) return true;
  if (error.keyValue && "parentId" in error.keyValue) return true;
  return /parentId_1/.test(String(error.message || ""));
}

const CLASH_ATTEMPTS = 5;

/**
 * Create a guardian, drawing a fresh Parent ID if the first one was taken in
 * the meantime. Every new guardian should be created through this, so a school
 * never sees an error caused by another school's guardian.
 *
 * The ID is drawn by the model's pre-save hook, so simply creating again draws
 * a new one. A caller that supplies its own `parentId` gets no retry: that ID
 * was chosen on purpose, and a clash on it is a real error.
 */
export async function createParentWithUniqueId(ParentModel, fields) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await ParentModel.create(fields);
    } catch (error) {
      if (!isParentIdClash(error) || fields?.parentId || attempt >= CLASH_ATTEMPTS) throw error;
    }
  }
}

/**
 * Save a guardian whose Parent ID was just assigned (a first card, a lost-card
 * reissue, or a backfill), drawing another ID if that one was taken meanwhile.
 */
export async function saveParentWithUniqueId(doc, options) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await doc.save(options);
    } catch (error) {
      if (!isParentIdClash(error) || attempt >= CLASH_ATTEMPTS) throw error;
      doc.parentId = await allocateParentId(doc.constructor);
    }
  }
}

export const PARENT_ID_PREFIX = ID_PREFIX;
export const PARENT_ID_ALPHABET = ID_ALPHABET;
