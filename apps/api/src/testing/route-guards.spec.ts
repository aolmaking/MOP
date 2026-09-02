/**
 * Every route is either guarded or on this list, and no path is claimed
 * twice.
 *
 * Written after F-006, which the whole test suite could not see. A
 * second controller was added declaring
 * `POST /technician/parts/:id/return` -- a path `TechnicianController`
 * already served -- with no `SessionGuard`, no ownership check, and the
 * acting identity read out of the request body. Any unauthenticated
 * caller could have returned a part on any workshop's job and signed it
 * as anybody. Nothing in 900-odd tests asked "is this route
 * authenticated?", so the only reason it was noticed is that it also
 * happened not to compile.
 *
 * A guard nobody has watched refuse is a guess with good intentions, and
 * so is an allowlist nobody has to justify. Adding a controller here is
 * deliberately annoying: the entry needs a sentence saying why the route
 * may be reached by someone with no session at all.
 */
import { Test } from "@nestjs/testing";
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { PrismaClient } from "@mop/database";
import { AppModule } from "../app.module";
import { PrismaService } from "../runtime/database/prisma.service";
import { SessionGuard } from "../identity/auth/session.guard";

/**
 * Controllers that may answer without a session, and the reason each one
 * may. Anything not listed here must be guarded.
 */
const PUBLIC_CONTROLLERS: Readonly<Record<string, string>> = {
  HealthController: "Liveness. An external probe has no account and must not need one.",
  CustomerDecisionController:
    "The approval link. The customer has no login -- the one-time token in the URL is the credential, and the service treats an unknown token and a real one identically.",
  RegisterController: "Customer self-registration. By definition there is no session yet.",
};

/**
 * Individual handlers on otherwise-guarded controllers that are public,
 * and why. `AuthController` guards `/me` and nothing else, which is
 * correct and worth stating rather than inferring.
 */
const PUBLIC_HANDLERS: Readonly<Record<string, string>> = {
  "AuthController.login": "Signing in is how a session begins.",
  "AuthController.refresh": "Carries the refresh cookie, which is its own credential; the access cookie is expired by definition.",
  "AuthController.logout": "Must succeed even when the session is already gone.",
  "AuthController.describeInvite": "The recipient has no account yet. Throttled, because a token is a secret.",
  "AuthController.acceptInvite": "Redeeming the invite is what creates the ability to log in.",
  "AuthController.requestPasswordReset": "A locked-out person has no session by definition. Throttled, and it answers the same way whether or not the identifier exists.",
  "AuthController.describePasswordReset": "Validates the emailed token before the new password is chosen; the token is the credential. Throttled, because a token is a secret.",
  "AuthController.completePasswordReset": "The moment the new password is set, still with no session to speak of.",
};

function guardsOn(target: object): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];
}

function methodName(method: number): string {
  return RequestMethod[method] ?? String(method);
}

describe("route guards", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  async function buildApp() {
    const prisma = new PrismaClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    return { moduleRef, prisma };
  }

  beforeAll(async () => {
    app = await buildApp();
  }, 120_000);

  afterAll(async () => {
    await app.prisma.$disconnect();
  }, 120_000);

  /**
   * Walks every registered controller and returns one row per HTTP
   * handler: its full path, its method, and whether a session is
   * required to reach it.
   */
  function routes() {
    const found: {
      controller: string;
      handler: string;
      method: string;
      path: string;
      guarded: boolean;
    }[] = [];

    // The container knows every controller instance that was actually
    // registered -- reading source files instead would miss a controller
    // that exists but was never added to a module, and flag one that was
    // deleted but left behind.
    const container = (app.moduleRef as unknown as { container: { getModules(): Map<string, { controllers: Map<unknown, { metatype: new (...args: never[]) => object }> }> } }).container;

    for (const module of container.getModules().values()) {
      for (const wrapper of module.controllers.values()) {
        const type = wrapper.metatype;
        if (!type) continue;

        const controllerPath = (Reflect.getMetadata(PATH_METADATA, type) as string | undefined) ?? "";
        const controllerGuards = guardsOn(type);

        for (const handler of Object.getOwnPropertyNames(type.prototype)) {
          if (handler === "constructor") continue;
          const descriptor = Object.getOwnPropertyDescriptor(type.prototype, handler);
          if (!descriptor || typeof descriptor.value !== "function") continue;

          const method = Reflect.getMetadata(METHOD_METADATA, descriptor.value) as number | undefined;
          if (method === undefined) continue;

          const handlerPath = (Reflect.getMetadata(PATH_METADATA, descriptor.value) as string | undefined) ?? "";
          const guards = [...controllerGuards, ...guardsOn(descriptor.value)];

          found.push({
            controller: type.name,
            handler,
            method: methodName(method),
            path: `/${controllerPath}/${handlerPath}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
            guarded: guards.includes(SessionGuard),
          });
        }
      }
    }

    return found;
  }

  it("finds the application's routes at all", () => {
    // If this ever drops to a handful, the walk above broke and every
    // assertion below became vacuously true.
    expect(routes().length).toBeGreaterThan(100);
  });

  it("requires a session on every route that is not deliberately public", () => {
    const unguarded = routes()
      .filter((route) => !route.guarded)
      .filter((route) => !(route.controller in PUBLIC_CONTROLLERS))
      .filter((route) => !(`${route.controller}.${route.handler}` in PUBLIC_HANDLERS))
      .map((route) => `${route.method} ${route.path}  (${route.controller}.${route.handler})`);

    expect(unguarded).toEqual([]);
  });

  /**
   * F-006's other half. Two controllers declaring the same path is not a
   * merge conflict -- git merges both happily -- and which one answers
   * is decided by module load order, written down nowhere.
   */
  it("never declares the same path twice", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const route of routes()) {
      const key = `${route.method} ${route.path}`;
      const owner = `${route.controller}.${route.handler}`;
      const previous = seen.get(key);
      if (previous) duplicates.push(`${key} -- ${previous} and ${owner}`);
      else seen.set(key, owner);
    }

    expect(duplicates).toEqual([]);
  });

  /**
   * An exemption for a handler that no longer exists is worse than no
   * exemption: it reads as deliberate, and the route it once covered has
   * either been renamed -- silently losing its exemption -- or deleted,
   * leaving a permission nobody needs. The first draft of this file had
   * exactly one such entry (`validateResetToken`, actually named
   * `describePasswordReset`), which is why this test exists.
   */
  it("has no exemption for a route that does not exist", () => {
    const live = new Set(routes().map((route) => `${route.controller}.${route.handler}`));
    const liveControllers = new Set(routes().map((route) => route.controller));

    expect(Object.keys(PUBLIC_HANDLERS).filter((key) => !live.has(key))).toEqual([]);
    expect(Object.keys(PUBLIC_CONTROLLERS).filter((name) => !liveControllers.has(name))).toEqual([]);
  });

  it("keeps the public list short and justified", () => {
    for (const reason of [...Object.values(PUBLIC_CONTROLLERS), ...Object.values(PUBLIC_HANDLERS)]) {
      expect(reason.length).toBeGreaterThan(30);
    }
  });
});
