import type { CookieOptions, Response } from "express";

export const ACCESS_COOKIE_NAME = "mop_access";
export const REFRESH_COOKIE_NAME = "mop_refresh";

function baseOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

export function setSessionCookies(
  res: Response,
  cookies: { accessToken: { value: string; maxAgeMs: number }; refreshToken: { value: string; maxAgeMs: number } },
): void {
  res.cookie(ACCESS_COOKIE_NAME, cookies.accessToken.value, baseOptions(cookies.accessToken.maxAgeMs));
  res.cookie(REFRESH_COOKIE_NAME, cookies.refreshToken.value, {
    ...baseOptions(cookies.refreshToken.maxAgeMs),
    // The refresh cookie only ever needs to be sent to the refresh
    // endpoint itself, narrowing where a stolen cookie could be replayed.
    path: "/api/v1/auth/refresh",
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, { path: "/" });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth/refresh" });
}
