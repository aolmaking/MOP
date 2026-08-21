import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * P-62, docs/POLICY_DECISION_INVENTORY.md (E18,
 * docs/scenarios3/EDGE_CASE_REGISTER.md): an INVARIANT, not a policy --
 * there is no defensible alternative to versioning a password hash and
 * lazily rehashing on successful login. The stored string now encodes
 * the scrypt parameters it was created under (`scrypt$N$r$p$salt$hash`),
 * so raising these constants later is safe: `needsRehash()` compares a
 * hash's own embedded parameters against the current target ones,
 * `verifyPassword` always derives using whichever parameters the hash
 * was actually created under, and nothing here ever forces every user
 * to reset their password just because the target cost changed.
 */
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
// scrypt needs roughly 128 * N * r bytes (~128MB at these params); Node's
// scryptSync defaults to a 32MB cap and throws rather than silently using
// less, so it must be raised explicitly to match the chosen N/r.
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

interface ScryptParams {
  readonly n: number;
  readonly r: number;
  readonly p: number;
}

const CURRENT_PARAMS: ScryptParams = { n: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P };

function derive(password: string, salt: string, params: ScryptParams): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: params.n,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = derive(password, salt, CURRENT_PARAMS).toString("hex");
  return `scrypt$${CURRENT_PARAMS.n}$${CURRENT_PARAMS.r}$${CURRENT_PARAMS.p}$${salt}$${hash}`;
}

/**
 * Every row written before this change is the 3-part legacy format
 * (`scrypt$salt$hash`), with no encoded parameters -- but every one of
 * them was, as a simple fact of history, created under today's
 * CURRENT_PARAMS, since no other parameters have ever been used. That is
 * the one safe assumption this function is allowed to make about the
 * legacy format; it is not generalizable to a second future format
 * change, which is exactly why the explicit 5-part format exists now.
 */
function parse(stored: string): { params: ScryptParams; salt: string; hashHex: string; isLegacyFormat: boolean } | null {
  const parts = stored.split("$");

  if (parts.length === 6 && parts[0] === "scrypt") {
    const [, nStr, rStr, pStr, salt, hashHex] = parts;
    const n = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
    return { params: { n, r, p }, salt, hashHex, isLegacyFormat: false };
  }

  if (parts.length === 3 && parts[0] === "scrypt") {
    const [, salt, hashHex] = parts;
    return { params: CURRENT_PARAMS, salt, hashHex, isLegacyFormat: true };
  }

  return null;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return false;

  const candidate = derive(password, parsed.salt, parsed.params);
  const expected = Buffer.from(parsed.hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * True if this hash should be replaced the next time we have the
 * plaintext password available to do it with -- either it was created
 * under weaker parameters than today's target, or it is the legacy
 * format with no recorded parameters at all (upgraded to the explicit
 * format proactively, rather than left ambiguous forever).
 */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return false; // Unparseable is a login failure elsewhere, not a rehash decision.
  if (parsed.isLegacyFormat) return true;
  return parsed.params.n !== CURRENT_PARAMS.n || parsed.params.r !== CURRENT_PARAMS.r || parsed.params.p !== CURRENT_PARAMS.p;
}

/**
 * Burns roughly the same time as a real verify, so "account not found" and
 * "wrong password" are indistinguishable from response timing.
 */
export function dummyVerifyForTimingSafety(): void {
  derive("dummy-password-for-timing-safety", "dummy-salt-for-timing-safety", CURRENT_PARAMS);
}
