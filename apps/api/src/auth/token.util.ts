import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface IssuedToken {
  /** The raw value that goes in the cookie: `${sessionId}.${secret}`. */
  cookieValue: string;
  /** What gets stored in the database -- never the raw secret. */
  secretHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueToken(sessionId: string): IssuedToken {
  const secret = randomBytes(32).toString("hex");
  return {
    cookieValue: `${sessionId}.${secret}`,
    secretHash: sha256(secret),
  };
}

export function newSessionId(): string {
  return randomBytes(12).toString("hex");
}

export interface ParsedToken {
  sessionId: string;
  secret: string;
}

export function parseToken(cookieValue: string | undefined): ParsedToken | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf(".");
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  return { sessionId: cookieValue.slice(0, dot), secret: cookieValue.slice(dot + 1) };
}

export function secretMatchesHash(secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(sha256(secret), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
