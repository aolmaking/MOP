import { routeCatalog } from "../product-constants";
import type { SessionContextDto } from "../contracts";
import { can } from "./permissions";

export function canRoute(session: SessionContextDto, routeId: string) {
  const route = routeCatalog.find((item) => item.id === routeId);
  if (!route) return false;
  if (!(route.accountTypes as readonly string[]).includes(session.accountType)) return false;
  return can(session, { permission: route.permission });
}

export function deniedRouteReason(session: SessionContextDto, routeId: string) {
  return canRoute(session, routeId) ? undefined : `Route ${routeId} is outside current permission or scope.`;
}
