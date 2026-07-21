import type { AccountType, CategoryCode, NavigationItemDto, WorkspaceDto } from "@mop/shared";

export interface RequestSessionContext {
  sessionId: string;
  accountId: string;
  accountType: AccountType;
  tenantId?: string;
  tenantName?: string;
  userId?: string;
  customerId?: string;
  displayName: string;
  landingPage: string;
  roleId: string;
  roleLabel: string;
  permissions: string[];
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: CategoryCode[];
  teamScope: string[];
  managedTechnicianIds: string[];
  permissionTemplateId?: string;
  userOverrides: Record<string, boolean>;
  effectivePermissionSources: Record<string, string>;
  enabledModules: string[];
  enabledFeatures: string[];
  builderConfigVersion?: string;
  tenantStatus?: string;
  readOnly: boolean;
  linkedAssetIds: string[];
  customerPortalStatus?: "enabled" | "disabled" | "invited";
  liveViewMode?: "read_only";
  allowedControlScopes: string[];
  supportAccessMode: "none" | "live_view_read_only";
  navigation: NavigationItemDto[];
  workspace: WorkspaceDto;
}

export interface RequestWithSession {
  session: RequestSessionContext;
}
