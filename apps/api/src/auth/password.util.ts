import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
// scrypt needs roughly 128 * N * r bytes (~128MB at these params); Node's
// scryptSync defaults to a 32MB cap and throws rather than silently using
// less, so it must be raised explicitly to match the chosen N/r.
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

function derive(password: string, salt: string): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = derive(password, salt).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;

  const candidate = derive(password, salt);
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Burns roughly the same time as a real verify, so "account not found" and
 * "wrong password" are indistinguishable from response timing.
 */
export function dummyVerifyForTimingSafety(): void {
  derive("dummy-password-for-timing-safety", "dummy-salt-for-timing-safety");
}
