import { Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PermissionResolverService } from "./permission-resolver.service";
import { ScopeResolverService, type ScopeArrayKind } from "./scope-resolver.service";
import type { LayerResult } from "./types";

/**
 * The only access-control entry point controllers/services should inject.
 * Wraps PermissionResolverService (layers 1-10, "can this session ever do
 * X") and ScopeResolverService (record scoping, "which records"), so callers never
 * reach into the layer arrays directly.
 *
 * Takes `session` as an explicit argument rather than reading it off a
 * request-scoped provider: SessionGuard already attaches a freshly-resolved
 * SessionContext to the request (see CurrentSession decorator), and a
 * request-scoped Nest provider would force this service -- and everything
 * that injects it -- into request scope too, for no real benefit over just
 * passing the value it already has.
 */
@Injectable()
export class EffectiveAccessService {
  constructor(
    private readonly permissionResolver: PermissionResolverService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async can(session: SessionContext, permissionKey: string): Promise<boolean> {
    const result = await this.permissionResolver.resolve(session, permissionKey);
    return result.allowed;
  }

  /** Same as can(), but returns the full decision -- use when the caller needs to explain a denial (e.g. a 403 body). */
  async check(session: SessionContext, permissionKey: string): Promise<LayerResult> {
    return this.permissionResolver.resolve(session, permissionKey);
  }

  scope(session: SessionContext, kind: ScopeArrayKind, fieldName: string): Record<string, { in: string[] }> {
    return this.scopeResolver.filterBy(session, kind, fieldName);
  }
}
