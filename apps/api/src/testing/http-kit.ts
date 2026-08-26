/**
 * The HTTP vehicle for tests that need to prove a journey works, not that
 * a service method returns the right object.
 *
 * Modelled on `identity/auth/auth.controller.integration.spec.ts`, which
 * exists because service-level tests alone let a real bug through:
 * `TenantUnavailableError` was a plain `Error`, so it fell into
 * `ApiExceptionFilter`'s catch-all and reached the browser as a generic
 * 500 while every service test stayed green. Nothing short of a real
 * round trip catches that class of defect.
 *
 * The one deliberate difference from that file: `bootApp` builds the
 * **whole `AppModule`**, not a hand-picked list of modules. A
 * walkthrough's most valuable assertion is often that a route is *not
 * there yet*, and a 404 only means that if every module was loaded. With
 * a hand-picked list, "the endpoint does not exist" and "I forgot to
 * import the module" are the same response, and the harness would report
 * an unbuilt feature and a wiring mistake identically.
 */
import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { Response } from "supertest";
import { PrismaClient } from "@mop/database";
import { AppModule } from "../app.module";
import { PrismaService } from "../runtime/database/prisma.service";
import { ApiExceptionFilter } from "../runtime/http/filters/api-exception.filter";
import { MoneySerializationInterceptor } from "../runtime/http/money-serialization.interceptor";
import { validationExceptionFactory } from "../runtime/http/validation/validation-exception-factory";

/**
 * Set the same way every integration spec in this codebase sets them, and
 * for the same reason: `??=` so a value already in the environment always
 * wins, and a bare `jest path/to/spec.ts` still finds a database.
 *
 * The throttle limits match `.env.test`. A walkthrough legitimately logs
 * in several times from one address, and production defaults (10/min)
 * would fail it for a reason that has nothing to do with what it is
 * testing. Throttling itself is proven by `auth/throttle.integration.spec.ts`,
 * which sets its own strict limit.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";
process.env.THROTTLE_AUTH_LIMIT ??= "1000";
process.env.THROTTLE_GLOBAL_LIMIT ??= "10000";

export interface BootedApp {
  readonly app: INestApplication;
  readonly prisma: PrismaClient;
  /** The server supertest drives. */
  readonly server: ReturnType<INestApplication["getHttpServer"]>;
  close(): Promise<void>;
}

/**
 * A logged-in session, as the browser would hold it: a cookie header
 * string ready to hand back to supertest via `.set("Cookie", ...)`.
 */
export interface Session {
  readonly cookie: string;
  readonly accountId: string;
  readonly role: string | null;
  readonly tenantId: string | null;
}

/**
 * Boots the real application the way `main.ts` boots it.
 *
 * Global prefix, cookie parsing, the exception filter, the money
 * interceptor and the validation pipe are all here because each one
 * changes what a caller observes: without the filter a domain error
 * arrives as a 500, without the pipe an invalid body reaches the service,
 * and without the interceptor money arrives as a number. A kit that
 * omitted any of them would let tests pass against a shape the browser
 * never sees.
 *
 * `helmet` and CORS are the two things `main.ts` does that this does not:
 * neither can change a status code or a body, and both would only add
 * noise to a failure.
 */
export async function bootApp(): Promise<BootedApp> {
  const prisma = new PrismaClient();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new MoneySerializationInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  await app.init();

  return {
    app,
    prisma,
    server: app.getHttpServer(),
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

/**
 * Logs in over real HTTP and returns the cookies a browser would then be
 * sending.
 *
 * Throws rather than returning a failed session: a walkthrough that could
 * not log in has nothing left to assert, and the failure is far easier to
 * read here — with the status and body attached — than three requests
 * later as an unexplained 401.
 */
export async function loginAs(booted: BootedApp, email: string, password: string): Promise<Session> {
  const res = await request(booted.server).post("/api/v1/auth/login").send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `loginAs(${email}) expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  if (!raw || raw.length === 0) {
    throw new Error(`loginAs(${email}) succeeded but set no cookies`);
  }

  return {
    // Only the name=value part: the attributes (HttpOnly, Path, SameSite)
    // belong on the response, and sending them back confuses some servers.
    cookie: raw.map((c) => c.split(";")[0]).join("; "),
    accountId: res.body.accountId,
    role: res.body.role ?? null,
    tenantId: res.body.tenantId ?? null,
  };
}

/**
 * Asserts an HTTP status and, when the response carries the standard
 * error envelope, its `code`.
 *
 * The reason this exists rather than two bare `expect`s: when a status
 * assertion fails, jest prints `expected 200, received 403` and nothing
 * else, and the actual refusal message — the part that says *why* — is
 * discarded. Here the whole body travels with the failure, which is
 * usually the entire diagnosis.
 */
export function expectCode(res: Response, status: number, code?: string): void {
  if (res.status !== status) {
    throw new Error(
      `expected HTTP ${status}${code ? ` (${code})` : ""}, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  if (code !== undefined && res.body?.code !== code) {
    throw new Error(`expected error code "${code}", got ${JSON.stringify(res.body)}`);
  }
}

/** `request(booted.server)`, shortened, since a walkthrough says it constantly. */
export function http(booted: BootedApp) {
  return request(booted.server);
}
