export type PlatformWorkshopStatus = "active" | "trial" | "pending_setup" | "frozen" | "suspended" | "archived" | "read_only";
export type PlatformControlTargetType = "global" | "all_workshops" | "plan" | "tenant" | "branch" | "role" | "user" | "module" | "feature" | "page" | "builder_area";
export type PlatformControlDomain = "lifecycle" | "module" | "role" | "feature" | "builder" | "access" | "limits" | "emergency" | "reports_visibility" | "data_visibility";
export type PlatformControlType = "hard_disable" | "soft_disable" | "read_only" | "hidden" | "locked" | "paused" | "frozen" | "archived" | "limited" | "enabled";
export type PlatformRiskLevel = "low" | "medium" | "high";

export interface PlatformWorkshopCardDto {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  status: PlatformWorkshopStatus;
  plan: string;
  branchesCount: number;
  usersCount: number;
  lastActivity: string;
  builderStatus: "default" | "draft" | "customized" | "locked";
  paymentStatus: "paid" | "trial" | "overdue" | "suspended";
  healthStatus: "healthy" | "watch" | "risk";
  usageScore: number;
  activeUsers: number;
  monthlyRevenue: number;
  mostUsedFeature: string;
}

export interface PlatformAddWorkshopOwnerDto {
  workshopName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPhone?: string;
  country?: string;
  city?: string;
  businessType: string;
  initialCategory: string;
  initialPackage: string;
  branchesAllowed: number;
  usersAllowed: number;
  enableDemoData: boolean;
  starterTemplate: string;
  status: PlatformWorkshopStatus;
}

export interface PlatformWorkshopReportDto {
  workshop: PlatformWorkshopCardDto;
  businessSuccess: Array<{ label: string; value: string | number }>;
  featureUsage: Array<{ feature: string; usage: number; trend: "up" | "flat" | "down" }>;
  builderAdoption: Array<{ label: string; value: string | number }>;
  operations: Array<{ label: string; value: string | number; risk?: PlatformRiskLevel }>;
  financialSnapshot: Array<{ label: string; value: string | number }>;
  healthRisks: Array<{ label: string; risk: PlatformRiskLevel; message: string }>;
}

export interface PlatformLiveViewRoleDto {
  role: string;
  label: string;
  pages: string[];
  userPersona: string;
  readOnly: boolean;
  blockedByControl?: string;
}

export interface PlatformLiveViewSessionDto {
  id: string;
  tenantId: string;
  tenantName: string;
  roleViewed: string;
  userPersona: string;
  mode: "read_only";
  startedAt: string;
}

export interface PlatformImpactPreviewDto {
  affectedRoles: string[];
  affectedPages: string[];
  affectedUsers: number;
  affectedActiveWorkOrders: number;
  customerPortalBehavior: string;
  builderBlocks: string[];
  reportsAffected: string[];
  historicalData: "preserved";
  riskLevel: PlatformRiskLevel;
  highRisk: boolean;
  requiresReason: boolean;
  rollbackAvailable: boolean;
  messages: string[];
}

export interface PlatformControlPolicyDto {
  id: string;
  targetType: PlatformControlTargetType;
  targetId?: string;
  controlDomain: PlatformControlDomain;
  controlKey: string;
  controlType?: PlatformControlType;
  value: boolean | string | number | string[] | Record<string, unknown>;
  riskLevel: PlatformRiskLevel;
  canTenantOverride: boolean;
  reason?: string;
  active: boolean;
  rollbackAvailable: boolean;
  createdAt: string;
}

export interface PlatformControlRequestDto {
  targetType: PlatformControlTargetType;
  targetId?: string;
  controlDomain: PlatformControlDomain;
  controlKey: string;
  controlType?: PlatformControlType;
  value: boolean | string | number | string[] | Record<string, unknown>;
  reason?: string;
  confirmed?: boolean;
}

export interface PlatformEffectiveControlResultDto {
  allowed: boolean;
  reason: string;
  message: string;
  source: "platform_control" | "tenant_status" | "permissions" | "runtime";
  canTenantOverride: boolean;
}

export interface PlatformCommandCenterDto {
  workshops: PlatformWorkshopCardDto[];
  reports: PlatformWorkshopReportDto[];
  liveViewRoles: Record<string, PlatformLiveViewRoleDto[]>;
  liveViewSessions: PlatformLiveViewSessionDto[];
  controls: PlatformControlPolicyDto[];
  auditEvents: Array<{ id: string; tenantId?: string; action: string; targetType: string; targetId?: string; reason?: string; riskLevel?: string; createdAt: string }>;
}
