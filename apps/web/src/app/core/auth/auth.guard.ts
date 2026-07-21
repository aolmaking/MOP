import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthStore } from "./auth.store";

export const authGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  await auth.ready();
  await auth.refreshContext();
  const routeId = String(route.data["routeId"] || "");
  if (!auth.session()) return router.parseUrl("/");
  if (routeId && !auth.canRoute(routeId)) return router.parseUrl(`/access-denied?route=${routeId}`);
  return true;
};
