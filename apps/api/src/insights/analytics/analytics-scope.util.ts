import type { CategoryCode } from "@mop/database";

export interface AnalyticsScope {
  readonly branchIds: readonly string[];
  readonly categoryIds: readonly string[];
}

/**
 * Data Analyst's scope is `StaffUser.branchScope`/`.categoryScope`, set
 * at invite time (Organization & Access) -- exactly like any other role,
 * per the spec's own insistence: "not automatically company-wide just
 * because their role has no operational duties." Empty arrays mean
 * unscoped (sees everything), the same convention `branchScope: []`
 * already carries everywhere else in this codebase (Team Setup, Branch
 * Manager delegation).
 */
export function resolveScope(session: { branchScope: string[]; categoryScope: string[] }): AnalyticsScope {
  return { branchIds: session.branchScope, categoryIds: session.categoryScope };
}

/** WorkOrder-level where-clause fragment for this scope. */
export function workOrderScopeFilter(scope: AnalyticsScope) {
  return {
    ...(scope.branchIds.length > 0 ? { branchId: { in: [...scope.branchIds] } } : {}),
    ...(scope.categoryIds.length > 0 ? { asset: { category: { in: [...scope.categoryIds] as CategoryCode[] } } } : {}),
  };
}

export function isMultiBranch(scope: AnalyticsScope, totalBranchCount: number): boolean {
  return scope.branchIds.length > 0 ? scope.branchIds.length > 1 : totalBranchCount > 1;
}
