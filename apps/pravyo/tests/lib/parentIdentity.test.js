import {
  generateParentIdCandidate,
  normalizeParentId,
  isValidParentIdFormat,
  allocateParentId,
  createParentWithUniqueId,
  saveParentWithUniqueId,
  isParentIdClash,
  PARENT_ID_ALPHABET,
  PARENT_ID_PREFIX,
} from "@/lib/parentIdentity";

/**
 * §2 and §53. The Parent ID is printed on paper, read aloud, and typed by
 * someone who may not be confident with Latin characters — while also being
 * something an attacker must not be able to enumerate.
 */

describe("generation", () => {
  it("produces the documented shape", () => {
    const id = generateParentIdCandidate();
    expect(id).toMatch(/^PRV-P-[A-Z0-9]{6}$/);
    expect(id.startsWith(PARENT_ID_PREFIX)).toBe(true);
  });

  it("excludes ambiguous characters (O, 0, I, 1)", () => {
    expect(PARENT_ID_ALPHABET).not.toMatch(/[O01I]/);

    // A mistyped character must not silently become a DIFFERENT valid id.
    for (let i = 0; i < 200; i += 1) {
      expect(generateParentIdCandidate().slice(6)).not.toMatch(/[O01I]/);
    }
  });

  it("is not sequential — 500 ids are all distinct", () => {
    const ids = new Set();
    for (let i = 0; i < 500; i += 1) ids.add(generateParentIdCandidate());
    expect(ids.size).toBe(500);
  });

  it("is not derived from anything predictable", () => {
    // Two ids generated back to back share no positional structure.
    const a = generateParentIdCandidate().slice(6);
    const b = generateParentIdCandidate().slice(6);
    const sharedPositions = [...a].filter((c, i) => c === b[i]).length;
    // Six identical characters in the same positions would mean a broken RNG.
    expect(sharedPositions).toBeLessThan(6);
  });
});

describe("normalisation — what a guardian actually types", () => {
  const CANONICAL = "PRV-P-X7K4Q9";

  it.each([
    ["PRV-P-X7K4Q9", "exact"],
    ["prv-p-x7k4q9", "lower case"],
    ["PRVPX7K4Q9", "no hyphens"],
    ["prv p x7k4q9", "spaces instead of hyphens"],
    ["X7K4Q9", "body only"],
    ["  PRV-P-X7K4Q9  ", "padded"],
    ["prv_p_x7k4q9", "underscores"],
  ])("accepts %s (%s)", (input) => {
    expect(normalizeParentId(input)).toBe(CANONICAL);
  });

  it("rejects anything with an ambiguous character", () => {
    // O is not in the alphabet, so this cannot be a real id.
    expect(normalizeParentId("PRV-P-X7K4Q0")).toBe("");
    expect(normalizeParentId("PRV-P-XIK4Q9")).toBe("");
  });

  it("rejects wrong lengths", () => {
    expect(normalizeParentId("PRV-P-X7K4Q")).toBe("");
    expect(normalizeParentId("PRV-P-X7K4Q99")).toBe("");
    expect(normalizeParentId("")).toBe("");
    expect(normalizeParentId(null)).toBe("");
    expect(normalizeParentId(undefined)).toBe("");
  });

  it("isValidParentIdFormat agrees with normalisation", () => {
    expect(isValidParentIdFormat("prv-p-x7k4q9")).toBe(true);
    expect(isValidParentIdFormat("nonsense")).toBe(false);
  });
});

describe("allocation", () => {
  it("retries past a collision", async () => {
    const exists = jest
      .fn()
      .mockResolvedValueOnce(true) // first candidate taken
      .mockResolvedValueOnce(false); // second is free

    const id = await allocateParentId({ exists });

    expect(exists).toHaveBeenCalledTimes(2);
    expect(id).toMatch(/^PRV-P-[A-Z0-9]{6}$/);
  });

  it("throws rather than returning a duplicate id", async () => {
    // Every candidate collides — must fail loudly, never hand back a taken id.
    const exists = jest.fn().mockResolvedValue(true);

    await expect(allocateParentId({ exists }, 3)).rejects.toThrow(
      /unique Parent ID/
    );
    expect(exists).toHaveBeenCalledTimes(3);
  });
});

/**
 * Two schools saving new guardians at the same instant could draw the same
 * random ID; the unique index rejects the second. That must turn into a quiet
 * retry with a fresh ID, never an error for the school or a duplicate.
 */
const parentIdClash = () =>
  Object.assign(new Error("E11000 duplicate key error index: parentId_1 dup key"), {
    code: 11000,
    keyPattern: { parentId: 1 },
  });
const emailClash = () =>
  Object.assign(new Error("E11000 duplicate key error index: email_1 dup key"), {
    code: 11000,
    keyPattern: { email: 1 },
  });

describe("Parent ID clash between schools", () => {
  it("recognises only a parentId clash", () => {
    expect(isParentIdClash(parentIdClash())).toBe(true);
    expect(isParentIdClash(emailClash())).toBe(false);
    expect(isParentIdClash(new Error("network"))).toBe(false);
  });

  it("creates again (drawing a new ID) when the first ID was taken meanwhile", async () => {
    const doc = { _id: "p1" };
    const create = jest.fn().mockRejectedValueOnce(parentIdClash()).mockResolvedValueOnce(doc);
    await expect(createParentWithUniqueId({ create }, { name: "Sita" })).resolves.toBe(doc);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("never retries a different clash, such as an email already in use", async () => {
    const create = jest.fn().mockRejectedValue(emailClash());
    await expect(createParentWithUniqueId({ create }, { name: "Sita" })).rejects.toThrow(/email_1/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the caller chose the Parent ID itself", async () => {
    const create = jest.fn().mockRejectedValue(parentIdClash());
    await expect(createParentWithUniqueId({ create }, { name: "Sita", parentId: "PRV-P-ABCDEF" })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("gives up after five tries instead of looping forever", async () => {
    const create = jest.fn().mockRejectedValue(parentIdClash());
    await expect(createParentWithUniqueId({ create }, { name: "Sita" })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(5);
  });

  it("on a reissue or backfill, swaps in a fresh ID and saves again", async () => {
    const exists = jest.fn().mockResolvedValue(false);
    const doc = {
      parentId: "PRV-P-AAAAAA",
      constructor: { exists },
      save: jest.fn().mockRejectedValueOnce(parentIdClash()).mockResolvedValueOnce(true),
    };
    await saveParentWithUniqueId(doc);
    expect(doc.save).toHaveBeenCalledTimes(2);
    expect(doc.parentId).not.toBe("PRV-P-AAAAAA");
    expect(doc.parentId).toMatch(/^PRV-P-[A-Z0-9]{6}$/);
  });
});
