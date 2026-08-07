import { issueToken, newSessionId, parseToken, secretMatchesHash } from "./token.util";

describe("token.util", () => {
  it("issues a cookie value in sessionId.secret form and a matching hash", () => {
    const sessionId = newSessionId();
    const { cookieValue, secretHash } = issueToken(sessionId);

    const parsed = parseToken(cookieValue);
    expect(parsed).toEqual({ sessionId, secret: expect.any(String) });
    expect(secretMatchesHash(parsed!.secret, secretHash)).toBe(true);
  });

  it("rejects a secret that doesn't match the stored hash", () => {
    const { secretHash } = issueToken(newSessionId());
    expect(secretMatchesHash("wrong-secret", secretHash)).toBe(false);
  });

  it("parseToken returns null for missing, malformed, or empty-part input", () => {
    expect(parseToken(undefined)).toBeNull();
    expect(parseToken("no-dot-here")).toBeNull();
    expect(parseToken(".nosessionid")).toBeNull();
    expect(parseToken("nosecret.")).toBeNull();
  });

  it("generates unique session ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSessionId()));
    expect(ids.size).toBe(50);
  });
});
