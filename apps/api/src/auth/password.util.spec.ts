import { dummyVerifyForTimingSafety, hashPassword, verifyPassword } from "./password.util";

describe("password.util", () => {
  it("verifies a correct password against its own hash", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("correct-horse-battery-staple");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", () => {
    const first = hashPassword("same-password");
    const second = hashPassword("same-password");
    expect(first).not.toBe(second);
    expect(verifyPassword("same-password", first)).toBe(true);
    expect(verifyPassword("same-password", second)).toBe(true);
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(verifyPassword("anything", "scrypt$onlyonepart")).toBe(false);
  });

  it("dummyVerifyForTimingSafety runs without throwing and takes comparable time to a real verify", () => {
    const hash = hashPassword("timing-comparison");

    const realStart = process.hrtime.bigint();
    verifyPassword("timing-comparison", hash);
    const realDurationMs = Number(process.hrtime.bigint() - realStart) / 1e6;

    const dummyStart = process.hrtime.bigint();
    dummyVerifyForTimingSafety();
    const dummyDurationMs = Number(process.hrtime.bigint() - dummyStart) / 1e6;

    // Not an exact match (scrypt timing has natural jitter), but should be
    // the same order of magnitude -- proves this isn't a no-op that would
    // make "account not found" measurably faster than "wrong password".
    expect(dummyDurationMs).toBeGreaterThan(realDurationMs / 3);
  });
});
