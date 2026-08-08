/**
 * Proves the login endpoint is actually rate limited, over real HTTP,
 * through the real global ThrottlerGuard.
 *
 * This is a security test, not a plumbing test. Password verification is
 * scrypt at N=131072 -- roughly 128MB of memory and real CPU per attempt.
 * Without a limit here, a few dozen concurrent requests exhaust the
 * server, so strong hashing without throttling is strictly worse than
 * weak hashing with it. The per-account lockout in AuthService cannot
 * cover this: an attacker burns the same CPU using addresses that do not
 * exist and never trips a single account's counter.
 *
 * Env is set before the imports below because both the ThrottlerModule
 * factory and AuthController's @Throttle decorator read it at
 * module-definition time.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";
process.env.THROTTLE_AUTH_LIMIT = "3";
process.env.THROTTLE_AUTH_TTL_MS = "60000";
process.env.THROTTLE_GLOBAL_LIMIT = "1000";

import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../app.module";

const AUTH_LIMIT = 3;

describe("Auth rate limiting (integration, real HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it("blocks login attempts past the configured limit with 429", async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "wrong-password-does-not-matter" });

    const statuses: number[] = [];
    for (let i = 0; i < AUTH_LIMIT + 2; i += 1) {
      const res = await attempt();
      statuses.push(res.status);
    }

    // The first AUTH_LIMIT attempts are answered normally (401 for an
    // unknown account); everything after is refused by the guard before
    // any hashing happens -- which is the entire point.
    expect(statuses.slice(0, AUTH_LIMIT).every((status) => status !== 429)).toBe(true);
    expect(statuses.slice(AUTH_LIMIT)).toEqual([429, 429]);
  }, 60_000);

  it("does not throttle unrelated endpoints at the auth limit", async () => {
    // /health sits under the generous global limit, so the strict auth
    // limit must not leak onto it. If it did, one attacker hammering
    // login would take monitoring down with it.
    const res = await request(app.getHttpServer()).get("/api/v1/health");
    expect(res.status).not.toBe(429);
  }, 30_000);
});
