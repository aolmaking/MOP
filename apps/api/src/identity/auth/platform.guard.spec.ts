import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { PlatformGuard } from "./platform.guard";

describe("PlatformGuard", () => {
  function createContext(accountType: string): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ session: { accountType } }) }),
    } as unknown as ExecutionContext;
  }

  it("allows a platform session through", () => {
    const guard = new PlatformGuard();

    expect(guard.canActivate(createContext("PLATFORM"))).toBe(true);
  });

  it("rejects a tenant staff session", () => {
    const guard = new PlatformGuard();

    expect(() => guard.canActivate(createContext("TENANT_STAFF"))).toThrow(ForbiddenException);
  });

  it("rejects a customer session", () => {
    const guard = new PlatformGuard();

    expect(() => guard.canActivate(createContext("CUSTOMER"))).toThrow(ForbiddenException);
  });
});
