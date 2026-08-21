import { scryptSync } from "node:crypto";
import { dummyVerifyForTimingSafety, hashPassword, needsRehash, verifyPassword } from "./password.util";

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

// P-62 (E18, docs/scenarios3/EDGE_CASE_REGISTER.md): versioning and lazy
// rehash. The point being proven is not "scrypt works" (covered above) --
// it is that a hash written under different parameters, including the
// pre-versioning legacy format with no parameters recorded at all, still
// verifies correctly and is correctly flagged for replacement.
describe("password hash versioning (P-62 / E18)", () => {
  it("encodes the scrypt parameters into every new hash", () => {
    const hash = hashPassword("a-real-password");
    const parts = hash.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(parts).toHaveLength(6); // scrypt, N, r, p, salt, hash
  });

  it("a freshly created hash does not need rehashing", () => {
    const hash = hashPassword("a-real-password");
    expect(needsRehash(hash)).toBe(false);
  });

  it("verifies and flags the pre-versioning legacy format (scrypt$salt$hash, 3 parts)", () => {
    // Reconstructed by hand, matching exactly what the old hashPassword()
    // used to write -- today's parameters, no version encoded.
    const salt = "deadbeefdeadbeefdeadbeefdeadbeef";
    const hashHex = scryptSync("legacy-password", salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }).toString(
      "hex",
    );
    const legacyHash = `scrypt$${salt}$${hashHex}`;

    expect(verifyPassword("legacy-password", legacyHash)).toBe(true);
    expect(verifyPassword("wrong-password", legacyHash)).toBe(false);
    // Correct despite never having been told which parameters this hash
    // used -- the legacy format's own guarantee is that it was ALWAYS
    // today's parameters, since no other parameters have ever shipped.
    expect(needsRehash(legacyHash)).toBe(true);
  });

  it("flags a hash created under weaker-than-current parameters for rehash, and still verifies it correctly", () => {
    const salt = "cafebabecafebabecafebabecafebabe";
    const weakParams = { N: 16384, r: 4, p: 1, maxmem: 64 * 1024 * 1024 }; // deliberately below today's target
    const hashHex = scryptSync("weak-params-password", salt, 64, weakParams).toString("hex");
    const weakHash = `scrypt$${weakParams.N}$${weakParams.r}$${weakParams.p}$${salt}$${hashHex}`;

    expect(verifyPassword("weak-params-password", weakHash)).toBe(true);
    expect(needsRehash(weakHash)).toBe(true);
  });

  it("rehashing a password produces a hash that no longer needs rehashing", () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const weakParams = { N: 16384, r: 4, p: 1, maxmem: 64 * 1024 * 1024 };
    const hashHex = scryptSync("upgrade-me", salt, 64, weakParams).toString("hex");
    const weakHash = `scrypt$${weakParams.N}$${weakParams.r}$${weakParams.p}$${salt}$${hashHex}`;
    expect(needsRehash(weakHash)).toBe(true);

    // The upgrade step AuthService.login() performs on a successful verify.
    const upgraded = hashPassword("upgrade-me");
    expect(verifyPassword("upgrade-me", upgraded)).toBe(true);
    expect(needsRehash(upgraded)).toBe(false);
  });
});
