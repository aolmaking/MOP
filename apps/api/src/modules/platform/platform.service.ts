import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AccountStatus, AccountType, AuditActorType, CategoryCode, Prisma, StaffStatus, TenantStatus } from "@prisma/client";
import {
  defaultRolePages,
  createDefaultBuilderConfiguration,
  resolveEffectivePlatformControls,
  rolePermissionMap,
  routeCatalog,
  type PlatformAddWorkshopOwnerDto,
  type PlatformCommandCenterDto,
  type PlatformControlPolicyDto,
  type PlatformControlRequestDto,
  type PlatformEffectiveControlResultDto,
  type PlatformImpactPreviewDto,
  type PlatformLiveViewRoleDto,
  type PlatformLiveViewSessionDto,
  type PlatformRiskLevel,
  type PlatformWorkshopCardDto,
  type PlatformWorkshopReportDto,
  type PlatformWorkshopStatus
} from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const CONTROL_PREFIX = "platform.control";
const LIVE_VIEW_KEY = "platform.live_view.sessions";

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationEvents: OperationEventsService
  ) {}

  async commandCenter(session: RequestSessionContext): Promise<PlatformCommandCenterDto> {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        accounts: { include: { staffUser: true, customer: true } },
        branches: true,
        workOrders: true,
        tasks: true,
        partRequests: true,
        partReturnRequests: true,
        customerDecisionRequests: true,
        payments: true,
        controlSettings: true,
        auditLogs: { orderBy: { createdAt: "desc" }, take: 8 }
      },
      orderBy: { updatedAt: "desc" }
    });
    const workshops = tenants.map((tenant) => this.workshopCard(tenant));
    const liveViewPairs = await Promise.all(tenants.map(async (tenant) => [tenant.id, await this.liveViewRoles(tenant)] as const));
    return {
      workshops,
      reports: tenants.map((tenant) => this.reportForTenant(tenant, this.workshopCard(tenant))),
      liveViewRoles: Object.fromEntries(liveViewPairs),
      liveViewSessions: await this.liveViewSessions(),
      controls: await this.controlPolicies(),
      auditEvents: await this.platformAuditEvents()
    };
  }

  async addWorkshopOwner(session: RequestSessionContext, input: PlatformAddWorkshopOwnerDto) {
    if (!input.workshopName || !input.ownerFullName || !input.ownerEmail) {
      throw new BadRequestException("Workshop name, owner name, and owner email are required.");
    }
    const slug = await this.uniqueSlug(input.workshopName);
    const registrationCode = `${slug.toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const ownerInviteToken = randomBytes(24).toString("hex");
    const tenant = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: {
          name: input.workshopName,
          slug,
          customerRegistrationCode: registrationCode,
          status: this.toTenantStatus(input.status)
        }
      });
      const account = await tx.account.create({
        data: {
          tenantId: createdTenant.id,
          accountType: AccountType.TENANT_STAFF,
          loginIdentifier: input.ownerEmail,
          passwordHash: null,
          inviteTokenHash: createHash("sha256").update(ownerInviteToken).digest("hex"),
          inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedBy: session.accountId,
          status: AccountStatus.INVITED
        }
      });
      const template = await tx.permissionTemplate.create({
        data: {
          id: `tpl_${createdTenant.id}_tenant_owner`,
          tenantId: createdTenant.id,
          code: "tenant_owner",
          label: "Tenant Owner"
        }
      });
      await tx.rolePage.createMany({
        data: (defaultRolePages.tenant_owner || []).map((pageId) => ({ tenantId: createdTenant.id, role: "tenant_owner", pageId }))
      });
      await tx.rolePermission.createMany({
        data: (rolePermissionMap.tenant_owner || []).map((permission) => ({ tenantId: createdTenant.id, role: "tenant_owner", permission, permissionTemplateId: template.id }))
      });
      for (const role of ["tenant_admin", "branch_manager", "technician", "inventory_manager", "team_leader", "data_analyst"]) {
        const roleTemplate = await tx.permissionTemplate.create({
          data: {
            id: `tpl_${createdTenant.id}_${role}`,
            tenantId: createdTenant.id,
            code: role,
            label: role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
          }
        });
        await tx.rolePage.createMany({
          data: (defaultRolePages[role] || []).map((pageId) => ({ tenantId: createdTenant.id, role, pageId }))
        });
        await tx.rolePermission.createMany({
          data: (rolePermissionMap[role] || []).map((permission) => ({
            tenantId: createdTenant.id,
            role,
            permission,
            permissionTemplateId: roleTemplate.id
          }))
        });
      }
      await tx.staffUser.create({
        data: {
          tenantId: createdTenant.id,
          accountId: account.id,
          name: input.ownerFullName,
          email: input.ownerEmail,
          role: "tenant_owner",
          isTenantOwner: true,
          status: StaffStatus.INVITED,
          branchScope: [],
          warehouseScope: [],
          categoryScope: [this.toCategory(input.initialCategory)],
          permissionTemplateId: template.id
        }
      });
      await tx.controlSetting.createMany({
        data: [
          { tenantId: createdTenant.id, key: "platform.owner.profile", value: { phone: input.ownerPhone || "", country: input.country || "", city: input.city || "", businessType: input.businessType } },
          { tenantId: createdTenant.id, key: "platform.tenant.status", value: input.status },
          { tenantId: createdTenant.id, key: "platform.entitlements", value: { plan: input.initialPackage, branchesAllowed: input.branchesAllowed, usersAllowed: input.usersAllowed, starterTemplate: input.starterTemplate, enableDemoData: input.enableDemoData } },
          { tenantId: createdTenant.id, key: "builder.starter_template", value: input.starterTemplate }
        ]
      });
      const builder = createDefaultBuilderConfiguration(createdTenant.id);
      await tx.tenantBuilderConfiguration.create({
        data: {
          tenantId: createdTenant.id,
          schemaVersion: builder.schemaVersion,
          baseTemplateVersion: builder.baseTemplateVersion,
          lastMigratedAt: new Date(),
          activeVersionId: builder.activeVersionId,
          draftVersionId: builder.draftVersionId,
          configPrecedence: builder.configPrecedence as unknown as Prisma.InputJsonValue,
          ownerModel: builder.ownerModel as unknown as Prisma.InputJsonValue,
          previewIdentities: builder.previewIdentities as unknown as Prisma.InputJsonValue,
          designTokens: builder.designTokens as unknown as Prisma.InputJsonValue,
          pageTemplates: builder.pageTemplates as unknown as Prisma.InputJsonValue,
          roleExperiences: builder.roleExperiences as unknown as Prisma.InputJsonValue,
          featurePolicies: builder.featurePolicies as unknown as Prisma.InputJsonValue,
          workflowPolicies: builder.workflowPolicies as unknown as Prisma.InputJsonValue,
          formSchemas: builder.formSchemas as unknown as Prisma.InputJsonValue,
          messageTemplates: builder.messageTemplates as unknown as Prisma.InputJsonValue
        }
      });
      await tx.tenantBuilderVersion.createMany({
        data: builder.versions.map((version) => ({
          tenantId: createdTenant.id,
          versionId: version.id,
          status: version.status,
          versionNumber: version.versionNumber,
          schemaVersion: builder.schemaVersion,
          baseTemplateVersion: builder.baseTemplateVersion,
          snapshot: builder as unknown as Prisma.InputJsonValue,
          reason: version.reason,
          publishedBy: version.publishedBy,
          publishedAt: version.publishedAt ? new Date(version.publishedAt) : null
        }))
      });
      await tx.auditLog.create({
        data: {
          tenantId: createdTenant.id,
          actorType: AuditActorType.PLATFORM,
          actorId: session.accountId,
          actorName: session.displayName,
          action: "platform.workshop.created",
          targetType: "tenant",
          targetId: createdTenant.id,
          reason: "Platform Super Admin created workshop owner.",
          after: { ownerEmail: input.ownerEmail, starterTemplate: input.starterTemplate, entitlements: { branchesAllowed: input.branchesAllowed, usersAllowed: input.usersAllowed } }
        }
      });
      return createdTenant;
    });
    return {
      status: "created",
      invitation: {
        ownerEmail: input.ownerEmail,
        status: "invited",
        delivery: "secure_link",
        inviteLink: `/invite/${ownerInviteToken}`,
        customerRegistrationCode: registrationCode
      },
      workshop: this.workshopCard(await this.reloadTenant(tenant.id))
    };
  }

  async freezeWorkshop(session: RequestSessionContext, tenantId: string, body: { reason?: string; freezeType?: string; internalNote?: string; notifyOwner?: boolean; confirmed?: boolean }) {
    if (!body?.confirmed || !body.reason) throw new BadRequestException("Freezing a workshop is high risk and requires confirmation plus reason.");
    const tenant = await this.reloadTenant(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.FROZEN, portalEnabled: false } });
      await tx.session.updateMany({ where: { account: { tenantId } }, data: { revokedAt: new Date() } });
      await tx.controlSetting.upsert({
        where: { tenantId_key: { tenantId, key: "platform.tenant.status" } },
        create: { tenantId, key: "platform.tenant.status", value: "frozen", updatedBy: session.accountId },
        update: { value: "frozen", updatedBy: session.accountId }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: AuditActorType.PLATFORM,
          actorId: session.accountId,
          actorName: session.displayName,
          action: "platform.workshop.frozen",
          targetType: "tenant",
          targetId: tenantId,
          reason: body.reason,
          before: { status: tenant.status, portalEnabled: tenant.portalEnabled },
          after: { status: "frozen", freezeType: body.freezeType || "manual", internalNote: body.internalNote || "", notifyOwner: Boolean(body.notifyOwner), rollbackAvailable: true }
        }
      });
    });
    await this.operationEvents.emitFromSession(session, {
      eventKey: "workshop.frozen",
      tenantId,
      statusChanges: [
        { entityType: "tenant_control", entityId: tenantId, fromStatus: String(tenant.status), toStatus: "FROZEN", label: "Workshop frozen" }
      ],
      notificationTargets: ["platform_super_admin", "tenant_owner", "reports_engine"],
      pageUpdates: ["platform-live-view", "platform-reports", "builder-home"],
      reportHooks: [
        { reportKey: "reports.platform.workshops.view", metric: "workshop_frozen", delta: 1, scope: ["platform"] }
      ],
      auditAction: "platform.workshop.frozen",
      canUndo: true,
      payload: { freeze_type: body.freezeType || "manual", sessions_revoked: true, portal_enabled: false },
      reason: body.reason,
      targetType: "tenant",
      targetId: tenantId
    });
    return { status: "frozen", workshop: this.workshopCard(await this.reloadTenant(tenantId)) };
  }

  async reactivateWorkshop(session: RequestSessionContext, tenantId: string, body: { reason?: string; confirmed?: boolean }) {
    if (!body?.confirmed || !body.reason) throw new BadRequestException("Reactivation requires confirmation and reason.");
    const tenant = await this.reloadTenant(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.ACTIVE, portalEnabled: true } });
      await tx.controlSetting.upsert({
        where: { tenantId_key: { tenantId, key: "platform.tenant.status" } },
        create: { tenantId, key: "platform.tenant.status", value: "active", updatedBy: session.accountId },
        update: { value: "active", updatedBy: session.accountId }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: AuditActorType.PLATFORM,
          actorId: session.accountId,
          actorName: session.displayName,
          action: "platform.workshop.reactivated",
          targetType: "tenant",
          targetId: tenantId,
          reason: body.reason,
          before: { status: tenant.status, portalEnabled: tenant.portalEnabled },
          after: { status: "active", rollbackAvailable: true }
        }
      });
    });
    await this.operationEvents.emitFromSession(session, {
      eventKey: "workshop.reactivated",
      tenantId,
      statusChanges: [
        { entityType: "tenant_control", entityId: tenantId, fromStatus: String(tenant.status), toStatus: "ACTIVE", label: "Workshop reactivated" }
      ],
      notificationTargets: ["platform_super_admin", "tenant_owner", "reports_engine"],
      pageUpdates: ["platform-live-view", "platform-reports", "builder-home"],
      reportHooks: [
        { reportKey: "reports.platform.workshops.view", metric: "workshop_reactivated", delta: 1, scope: ["platform"] }
      ],
      auditAction: "platform.workshop.reactivated",
      canUndo: true,
      payload: { portal_enabled: true },
      reason: body.reason,
      targetType: "tenant",
      targetId: tenantId
    });
    return { status: "active", workshop: this.workshopCard(await this.reloadTenant(tenantId)) };
  }

  async logLiveViewSession(session: RequestSessionContext, body: { tenantId: string; roleViewed: string; userPersona?: string }): Promise<PlatformLiveViewSessionDto> {
    const tenant = await this.reloadTenant(body.tenantId);
    const row: PlatformLiveViewSessionDto = {
      id: `live_${Date.now()}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      roleViewed: body.roleViewed,
      userPersona: body.userPersona || `${body.roleViewed} persona`,
      mode: "read_only",
      startedAt: new Date().toISOString()
    };
    const previous = await this.liveViewSessions();
    await this.setControlSetting(null, LIVE_VIEW_KEY, [row, ...previous].slice(0, 50), session.accountId);
    await this.platformAudit(session, body.tenantId, "platform.live_view.opened", "tenant", body.tenantId, "Platform Live View opened read-only.", "low", row);
    return row;
  }

  async previewControl(_session: RequestSessionContext, input: PlatformControlRequestDto): Promise<PlatformImpactPreviewDto> {
    return this.impactFor(input);
  }

  async applyControl(session: RequestSessionContext, input: PlatformControlRequestDto) {
    const impact = await this.impactFor(input);
    if (impact.requiresReason && !input.reason) throw new BadRequestException("High-risk platform controls require a reason.");
    if (impact.highRisk && !input.confirmed) throw new BadRequestException("High-risk platform controls require explicit confirmation.");
    const tenantId = input.targetType === "tenant" ? input.targetId : undefined;
    const key = `${CONTROL_PREFIX}.${input.targetType}.${input.targetId || "global"}.${input.controlDomain}.${input.controlKey}`;
    const before = await this.prisma.controlSetting.findFirst({ where: { tenantId: tenantId || null, key } });
    const policy = this.policyValue(input, impact);
    await this.setControlSetting(tenantId || null, key, policy, session.accountId);
    await this.enforcePlatformControl(session, tenantId, input);
    await this.enforceLifecycleControl(session, tenantId, input);
    await this.platformAudit(session, tenantId, "platform.control.applied", "platform_control", key, input.reason || "Platform control applied.", impact.riskLevel, { before: before?.value || null, after: policy, impact });
    await this.operationEvents.emitFromSession(session, {
      eventKey: "platform_control.changed",
      tenantId,
      statusChanges: [
        { entityType: "tenant_control", entityId: key, fromStatus: before ? "configured" : "new", toStatus: String(input.controlType || input.value), label: `${input.controlDomain}.${input.controlKey}` }
      ],
      notificationTargets: ["platform_super_admin", "tenant_owner", "reports_engine"],
      pageUpdates: ["platform-control", "builder-configuration-permissions", "reports", "analytics-home"],
      reportHooks: [
        { reportKey: "reports.platform.workshops.view", metric: "platform_control_applied", delta: 1, scope: ["platform"] },
        { reportKey: "reports.permissions_audit.view", metric: "platform_control_lock", delta: 1, scope: ["company"] }
      ],
      auditAction: "platform.control.applied",
      canUndo: impact.rollbackAvailable,
      payload: {
        control: policy,
        impact,
        reports_affected: impact.reportsAffected,
        builder_blocks: impact.builderBlocks
      },
      reason: input.reason || "Platform control applied.",
      targetType: "platform_control",
      targetId: key
    });
    return { status: "applied", control: this.policyDto(key, policy, before?.createdAt || new Date()), impact };
  }

  async rollbackControl(session: RequestSessionContext, body: { policyId: string; reason?: string; confirmed?: boolean }) {
    if (!body?.policyId) throw new BadRequestException("policyId is required.");
    if (!body.confirmed || !body.reason) throw new BadRequestException("Rollback requires confirmation and reason.");
    const row = await this.prisma.controlSetting.findFirst({ where: { key: body.policyId } });
    if (!row) throw new NotFoundException("Control policy was not found.");
    const previous = row.value as any;
    const next = { ...previous, active: false, rolledBackAt: new Date().toISOString(), rollbackReason: body.reason };
    await this.setControlSetting(row.tenantId || null, row.key, next, session.accountId);
    if (row.tenantId && previous?.controlDomain === "lifecycle" && previous?.controlKey === "tenant_status") {
      await this.prisma.tenant.update({ where: { id: row.tenantId }, data: { status: TenantStatus.ACTIVE, portalEnabled: true } });
    }
    await this.platformAudit(session, row.tenantId || undefined, "platform.control.rollback", "platform_control", row.key, body.reason, "medium", { before: previous, after: next });
    return { status: "rolled_back", policyId: row.key };
  }

  async resolveEffectiveControls(tenantId?: string, controlKey?: string): Promise<PlatformEffectiveControlResultDto> {
    if (!tenantId) return { allowed: true, reason: "GLOBAL_PLATFORM_CONTEXT", message: "Global platform controls are available.", source: "platform_control", canTenantOverride: false };
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { controlSettings: true } });
    if (!tenant) throw new NotFoundException("Workshop was not found.");
    const status = this.statusForTenant(tenant);
    const policies = (await this.controlPolicies()).filter((policy) => {
      if (policy.targetType === "global" || policy.targetType === "all_workshops") return true;
      if (policy.targetType === "tenant" && policy.targetId === tenantId) return true;
      return false;
    });
    return resolveEffectivePlatformControls({
      tenantStatus: status,
      controlKey,
      moduleKey: controlKey,
      featureKey: controlKey,
      roleKey: controlKey,
      policies
    });
  }

  private workshopCard(tenant: any): PlatformWorkshopCardDto {
    const owner = tenant.accounts?.find((account: any) => account.staffUser?.isTenantOwner) || tenant.accounts?.find((account: any) => account.staffUser?.role === "tenant_owner") || tenant.accounts?.[0];
    const status = this.statusForTenant(tenant);
    const activeUsers = tenant.accounts?.filter((account: any) => account.status === AccountStatus.ACTIVE).length || 0;
    const usageScore = Math.min(100, (tenant.workOrders?.length || 0) * 12 + activeUsers * 4 + (tenant.partRequests?.length || 0) * 3);
    const payments = Array.isArray(tenant.payments) ? tenant.payments : [];
    const recentRevenue = payments
      .filter((payment: any) => {
        const createdAt = new Date(payment.createdAt || payment.updatedAt || 0);
        return Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000;
      })
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      ownerName: owner?.staffUser?.name || "Owner pending",
      ownerEmail: owner?.loginIdentifier || "",
      ownerPhone: this.settingValue(tenant, "platform.owner.profile")?.phone || "",
      status,
      plan: this.settingValue(tenant, "platform.entitlements")?.plan || "Starter",
      branchesCount: tenant.branches?.length || 0,
      usersCount: tenant.accounts?.length || 0,
      lastActivity: tenant.auditLogs?.[0]?.createdAt?.toISOString?.() || tenant.updatedAt.toISOString(),
      builderStatus: tenant.controlSettings?.some((setting: any) => setting.key === "builder.configuration") ? "customized" : "default",
      paymentStatus: status === "trial" ? "trial" : status === "suspended" ? "suspended" : "paid",
      healthStatus: status === "active" ? "healthy" : status === "trial" || status === "pending_setup" ? "watch" : "risk",
      usageScore,
      activeUsers,
      monthlyRevenue: status === "trial" ? 0 : recentRevenue,
      mostUsedFeature: (tenant.partRequests?.length || 0) > 0 ? "Inventory Requests" : "Technician Work Card"
    };
  }

  private reportForTenant(tenant: any, workshop: PlatformWorkshopCardDto): PlatformWorkshopReportDto {
    const completed = tenant.workOrders?.filter((row: any) => row.status === "DELIVERED" || row.status === "READY_FOR_DELIVERY").length || 0;
    
    const totalTasks = tenant.tasks?.length || 0;
    const activeTasks = tenant.tasks?.filter((t: any) => t.status !== "TODO" && t.status !== "BLOCKED").length || 0;
    const techUsage = totalTasks > 0 ? Math.round((activeTasks / totalTasks) * 100) : 0;
    
    const totalWOs = tenant.workOrders?.length || 0;
    const totalDecisionReqs = tenant.customerDecisionRequests?.length || 0;
    const decisionUsage = totalWOs > 0 ? Math.round((totalDecisionReqs / totalWOs) * 100) : 0;
    
    const totalParts = tenant.partRequests?.length || 0;
    const partsUsage = totalWOs > 0 ? Math.round((totalParts / (totalWOs * 3)) * 100) : 0;
    
    const usedParts = tenant.partRequests?.filter((row: any) => ["USED", "ISSUED", "ARRIVED"].includes(row.status))?.length || 0;
    const partsUsedUsage = totalParts > 0 ? Math.round((usedParts / totalParts) * 100) : 0;
    
    const returns = tenant.partReturnRequests?.length || 0;
    const returnsUsage = totalParts > 0 ? Math.round((returns / totalParts) * 100) : 0;

    const quickServiceAuditCount = tenant.auditLogs?.filter((row: any) => row.action?.includes("quick_service"))?.length || 0;
    const quickServiceUsage = Math.min(100, quickServiceAuditCount * 5);

    const diagCodesAuditCount = tenant.auditLogs?.filter((row: any) => row.action?.includes("diagnostic_code"))?.length || 0;
    const diagUsage = Math.min(100, diagCodesAuditCount * 10);

    const qcTasks = tenant.tasks?.filter((task: any) => task.status === "READY_FOR_QC").length || 0;
    const qcUsage = totalTasks > 0 ? Math.round((qcTasks / totalTasks) * 100) : 0;
    
    const activeWOs = tenant.workOrders?.filter((w: any) => !["DELIVERED", "CANCELLED"].includes(w.status)).length || 0;
    const bmUsage = activeWOs > 0 ? Math.min(100, activeWOs * 10) : 0;

    const plan = this.settingValue(tenant, "platform.entitlements")?.plan || "Starter";
    const planPrice = plan === "Enterprise" ? 15000 : plan === "Growth" ? 8000 : 3000;
    const payments = Array.isArray(tenant.payments) ? tenant.payments : [];
    const monthlyRevenue = payments
      .filter((payment: any) => {
        const createdAt = new Date(payment.createdAt || payment.updatedAt || 0);
        return Date.now() - createdAt.getTime() <= 30 * 24 * 60 * 60 * 1000;
      })
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    const paidAmount = payments.reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    const nextRenewal = new Date(tenant.createdAt || Date.now());
    const latestPayment = payments
      .map((payment: any) => ({ ...payment, createdAt: new Date(payment.createdAt || payment.updatedAt || 0) }))
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latestPayment?.createdAt) {
      nextRenewal.setTime(latestPayment.createdAt.getTime());
    }
    nextRenewal.setMonth(nextRenewal.getMonth() + 1);
    const revenue = workshop.paymentStatus === "trial" ? 0 : monthlyRevenue;

    return {
      workshop,
      businessSuccess: [
        { label: "Active users", value: workshop.activeUsers },
        { label: "Opened work orders", value: totalWOs },
        { label: "Completed work orders", value: completed },
        { label: "Active branches", value: workshop.branchesCount }
      ],
      featureUsage: [
        { feature: "Technician Work Card", usage: techUsage, trend: techUsage > 50 ? "up" : "flat" },
        { feature: "Customer Decision Requests", usage: decisionUsage, trend: decisionUsage > 20 ? "up" : "flat" },
        { feature: "Inventory Requests", usage: Math.min(100, partsUsage), trend: "flat" },
        { feature: "Parts Used / Issued", usage: partsUsedUsage, trend: partsUsedUsage > 50 ? "up" : "flat" },
        { feature: "Returns Processed", usage: returnsUsage, trend: "flat" },
        { feature: "Quick Service", usage: quickServiceUsage, trend: quickServiceUsage > 0 ? "up" : "flat" },
        { feature: "Computer Codes", usage: diagUsage, trend: diagUsage > 0 ? "up" : "flat" },
        { feature: "Customer Portal", usage: tenant.portalEnabled ? 100 : 0, trend: tenant.portalEnabled ? "up" : "down" },
        { feature: "Workshop Builder", usage: workshop.builderStatus === "customized" ? 100 : 18, trend: workshop.builderStatus === "customized" ? "up" : "flat" },
        { feature: "Team Leader Supervision", usage: qcUsage, trend: qcUsage > 20 ? "up" : "flat" },
        { feature: "Branch Manager", usage: bmUsage, trend: bmUsage > 40 ? "up" : "flat" }
      ],
      builderAdoption: [
        { label: "Theme changed", value: workshop.builderStatus === "customized" ? "Yes" : "No" },
        { label: "Pages customized", value: workshop.builderStatus === "customized" ? tenant.auditLogs?.filter((l: any) => l.action === "builder.page_modified").length || 0 : 0 },
        { label: "Forms customized", value: workshop.builderStatus === "customized" ? tenant.auditLogs?.filter((l: any) => l.action === "builder.form_modified").length || 0 : 0 },
        { label: "Messages customized", value: workshop.builderStatus === "customized" ? tenant.auditLogs?.filter((l: any) => l.action === "builder.message_modified").length || 0 : 0 },
        { label: "Last publish", value: tenant.auditLogs?.find((row: any) => row.action?.includes("builder.publish"))?.createdAt?.toISOString?.() || "No publish yet" },
        { label: "Rollback count", value: tenant.auditLogs?.filter((row: any) => row.action?.includes("builder.rollback")).length || 0 },
        { label: "Validation failures", value: tenant.auditLogs?.filter((row: any) => row.action?.includes("validation_failed")).length || 0 },
        { label: "High-risk changes", value: tenant.auditLogs?.filter((row: any) => (row.after as any)?.riskLevel === "high").length || 0 }
      ],
      operations: [
        { label: "Work orders created", value: totalWOs },
        { label: "Tasks started", value: activeTasks },
        { label: "Tasks completed", value: tenant.tasks?.filter((task: any) => task.status === "COMPLETED" || task.status === "READY_FOR_QC").length || 0 },
        { label: "Parts requested", value: totalParts },
        { label: "Inventory movements", value: tenant.auditLogs?.filter((row: any) => row.action?.includes("inventory")).length || 0 },
        { label: "Customer approvals", value: tenant.customerDecisionRequests?.filter((row: any) => row.status === "APPROVED").length || 0 },
        { label: "Blocked tasks", value: tenant.tasks?.filter((task: any) => task.status === "BLOCKED").length || 0, risk: "medium" },
        { label: "Waiting parts cases", value: tenant.workOrders?.filter((row: any) => row.status === "WAITING_FOR_PARTS").length || 0, risk: "medium" },
        { label: "Open tasks", value: tenant.tasks?.filter((task: any) => task.status !== "COMPLETED").length || 0 },
        { label: "Portal status", value: tenant.portalEnabled ? "Enabled" : "Locked", risk: tenant.portalEnabled ? "low" : "high" }
      ],
      financialSnapshot: [
        { label: "Monthly revenue", value: revenue },
        { label: "Plan price", value: planPrice },
        { label: "Payment status", value: workshop.paymentStatus },
        { label: "Paid amount", value: paidAmount },
        { label: "Remaining amount", value: Math.max(0, planPrice - paidAmount) },
        { label: "Next renewal", value: nextRenewal.toISOString().split('T')[0] },
        { label: "Overdue amount", value: workshop.paymentStatus === "overdue" ? Math.max(0, planPrice - paidAmount) : 0 }
      ],
      healthRisks: [
        { label: "Workspace health", risk: workshop.healthStatus === "risk" ? "high" : workshop.healthStatus === "watch" ? "medium" : "low", message: `Current status: ${workshop.status}` },
        { label: "Feature adoption", risk: workshop.usageScore < 35 ? "medium" : "low", message: workshop.usageScore < 35 ? "Feature adoption is still low." : "Feature adoption is acceptable." },
        { label: "Payment risk", risk: workshop.paymentStatus === "paid" || workshop.paymentStatus === "trial" ? "low" : "high", message: `Payment status: ${workshop.paymentStatus}` }
      ]
    };
  }

  private async liveViewRoles(tenant: any): Promise<PlatformLiveViewRoleDto[]> {
    const builder = await this.prisma.tenantBuilderConfiguration.findUnique({ where: { tenantId: tenant.id } });
    const templates = Array.isArray(builder?.pageTemplates) ? builder.pageTemplates as Array<any> : [];
    const pageRoute: Record<string, string> = {
      "technician.home": "technician",
      "technician.work_card": "work-card",
      "inventory.home": "inventory-home",
      "branch.home": "branch-home",
      "team.review": "team-review",
      "customer.portal": "customer"
    };
    const roles = [
      ["tenant_owner", "Owner / Tenant Admin"],
      ["branch_manager", "Branch Manager"],
      ["technician", "Technician"],
      ["inventory_manager", "Inventory Manager"],
      ["team_leader", "Team Leader"],
      ["customer", "Customer Portal"]
    ];
    return roles.map(([role, label]) => {
      const configuredPages = templates
        .filter((template) => template.role === role)
        .map((template) => pageRoute[template.pageKey])
        .filter(Boolean);
      const persona = role === "customer"
        ? tenant.accounts.find((account: any) => account.customer)?.customer?.fullName || "Customer fixture"
        : tenant.accounts.find((account: any) => account.staffUser?.role === role)?.staffUser?.name || `${label} fixture`;
      const blocked = tenant.controlSettings.find((setting: any) => setting.key.includes(`role.${role}`) && ((setting.value as any)?.value === false || (setting.value as any)?.controlType === "hard_disable"));
      return this.roleTile(role, label, persona, configuredPages, blocked?.key);
    });
  }

  private roleTile(role: string, label: string, userPersona: string, configuredPages: string[] = [], blockedByControl?: string): PlatformLiveViewRoleDto {
    const accountType = role === "customer" ? "customer" : "tenant_staff";
    return {
      role,
      label,
      pages: configuredPages.length ? configuredPages : defaultRolePages[role] || routeCatalog.filter((route) => (route.accountTypes as readonly string[]).includes(accountType)).map((route) => route.id).slice(0, 3),
      userPersona,
      readOnly: true,
      blockedByControl
    };
  }

  private async impactFor(input: PlatformControlRequestDto): Promise<PlatformImpactPreviewDto> {
    const riskLevel = this.riskFor(input);
    const highRisk = riskLevel === "high";
    const module = input.controlKey.replace(/_/g, " ");
    
    let affectedUsers = 0;
    let affectedActiveWorkOrders = 0;
    
    if (input.targetType === "tenant" && input.targetId) {
      affectedUsers = await this.prisma.account.count({ where: { tenantId: input.targetId, status: AccountStatus.ACTIVE } });
      affectedActiveWorkOrders = await this.prisma.workOrder.count({ where: { tenantId: input.targetId, status: { notIn: ["DELIVERED", "CANCELLED"] } } });
    } else {
      affectedUsers = await this.prisma.account.count({ where: { status: AccountStatus.ACTIVE } });
      affectedActiveWorkOrders = await this.prisma.workOrder.count({ where: { status: { notIn: ["DELIVERED", "CANCELLED"] } } });
    }

    return {
      affectedRoles: this.affectedRoles(input),
      affectedPages: this.affectedPages(input),
      affectedUsers,
      affectedActiveWorkOrders: input.controlDomain === "module" || input.controlDomain === "emergency" ? affectedActiveWorkOrders : 0,
      customerPortalBehavior: input.controlKey.includes("customer_portal") || input.controlDomain === "emergency" ? "Customer portal may be locked or read-only." : "No customer portal change.",
      builderBlocks: input.controlDomain === "builder" || input.controlDomain === "module" ? [`${module} blocks controlled by platform`] : [],
      reportsAffected: this.reportsAffected(input),
      historicalData: "preserved",
      riskLevel,
      highRisk,
      requiresReason: riskLevel !== "low",
      rollbackAvailable: true,
      messages: [`${input.controlDomain}.${input.controlKey} will be applied at ${input.targetType} scope.`, "Historical data remains preserved.", "Tenant Admin cannot override platform-disabled controls."]
    };
  }

  private riskFor(input: PlatformControlRequestDto): PlatformRiskLevel {
    const key = `${input.controlDomain}.${input.controlKey}.${String(input.value)}`.toLowerCase();
    if (input.controlDomain === "emergency" || key.includes("freeze") || key.includes("suspend") || key.includes("disable_inventory") || key.includes("technician") || key.includes("critical_warning") || key.includes("tenant_owner") || key.includes("customer_portal") || key.includes("reports_module") || key.includes("financial_reports")) return "high";
    if (input.controlDomain === "limits" || input.controlDomain === "builder" || key.includes("readonly") || key.includes("lock")) return "medium";
    return "low";
  }

  private affectedRoles(input: PlatformControlRequestDto) {
    if (input.controlDomain === "role") return [input.controlKey];
    if (input.controlDomain === "reports_visibility" && input.controlKey.includes("user_performance")) return ["tenant_owner", "tenant_admin", "branch_manager", "team_leader", "data_analyst"];
    if (input.controlDomain === "reports_visibility" && input.controlKey.includes("inventory")) return ["tenant_owner", "tenant_admin", "inventory_manager", "data_analyst"];
    if (input.controlDomain === "reports_visibility") return ["tenant_owner", "tenant_admin", "branch_manager", "team_leader", "inventory_manager", "data_analyst"];
    if (input.controlKey.includes("inventory")) return ["inventory_manager", "technician", "branch_manager"];
    if (input.controlKey.includes("customer")) return ["customer", "branch_manager", "technician"];
    return ["tenant_owner", "tenant_admin"];
  }

  private affectedPages(input: PlatformControlRequestDto) {
    return routeCatalog.filter((route) => this.affectedRoles(input).some((role) => (defaultRolePages[role] || []).includes(route.id))).map((route) => route.id);
  }

  private reportsAffected(input: PlatformControlRequestDto) {
    const module = input.controlKey.replace(/_/g, " ");
    if (input.controlDomain === "reports_visibility") {
      if (input.controlKey.includes("exports")) return ["CSV, PDF, and Excel exports become locked in Owner Configuration and user pages."];
      if (input.controlKey.includes("financial_reports")) return ["Financial report permissions and payment snapshot reports become locked by platform."];
      if (input.controlKey.includes("inventory_value_reports")) return ["Inventory value reports become locked while operational stock health can remain visible."];
      if (input.controlKey.includes("user_performance_reports")) return ["Team, technician performance, and user drill-down reports become locked."];
      if (input.controlKey.includes("reports_module")) return ["All tenant report routes and report widgets become hidden or blocked by platform."];
      return [`${module} report visibility will be locked by platform.`];
    }
    if (input.controlDomain === "module") return [`${module} adoption reports will reflect disabled state.`];
    return [];
  }

  private async controlPolicies(): Promise<PlatformControlPolicyDto[]> {
    const rows = await this.prisma.controlSetting.findMany({ where: { key: { startsWith: CONTROL_PREFIX } }, orderBy: { updatedAt: "desc" } });
    return rows.map((row) => this.policyDto(row.key, row.value, row.createdAt));
  }

  private policyDto(key: string, value: any, createdAt: Date): PlatformControlPolicyDto {
    return {
      id: key,
      targetType: value?.targetType || "global",
      targetId: value?.targetId,
      controlDomain: value?.controlDomain || "feature",
      controlKey: value?.controlKey || key.split(".").pop() || key,
      controlType: value?.controlType || "enabled",
      value: value?.value ?? true,
      riskLevel: value?.riskLevel || "low",
      canTenantOverride: false,
      reason: value?.reason,
      active: value?.active ?? true,
      rollbackAvailable: value?.rollbackAvailable ?? true,
      createdAt: createdAt.toISOString()
    };
  }

  private policyValue(input: PlatformControlRequestDto, impact: PlatformImpactPreviewDto) {
    return { ...input, controlType: input.controlType || "enabled", riskLevel: impact.riskLevel, active: true, canTenantOverride: false, rollbackAvailable: true, previousValue: null, appliedAt: new Date().toISOString() };
  }

  private async enforceLifecycleControl(session: RequestSessionContext, tenantId: string | undefined, input: PlatformControlRequestDto) {
    const isLifecycle = input.controlDomain === "lifecycle" && input.controlKey === "tenant_status";
    const isEmergency = input.controlDomain === "emergency" && input.controlKey === "tenant.status";
    
    if (!tenantId || (!isLifecycle && !isEmergency)) return;
    
    const value = String(input.value) as PlatformWorkshopStatus;
    await this.setControlSetting(tenantId, "platform.tenant.status", value, session.accountId);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: this.toTenantStatus(value),
        portalEnabled: !["frozen", "suspended", "archived"].includes(value)
      }
    });
    if (["frozen", "suspended", "archived"].includes(value)) {
      await this.prisma.session.updateMany({ where: { account: { tenantId } }, data: { revokedAt: new Date() } });
    }
  }

  private async enforcePlatformControl(session: RequestSessionContext, tenantId: string | undefined, input: PlatformControlRequestDto) {
    if (!tenantId) return;
    const now = new Date();

    if (input.controlDomain === "access" && input.controlKey === "owner_login" && input.value === false) {
      const ownerAccounts = await this.prisma.account.findMany({ where: { tenantId, accountType: AccountType.TENANT_STAFF }, include: { staffUser: true } });
      const ownerIds = ownerAccounts.filter((account) => account.staffUser?.isTenantOwner).map((account) => account.id);
      if (ownerIds.length) {
        await this.prisma.session.updateMany({ where: { accountId: { in: ownerIds } }, data: { revokedAt: now } });
      }
    }

    if (input.controlDomain === "feature" && input.controlKey === "customer_portal" && input.value === false) {
      await this.prisma.session.updateMany({ where: { account: { tenantId, accountType: AccountType.CUSTOMER } }, data: { revokedAt: now } });
    }
  }

  private async setControlSetting(tenantId: string | null, key: string, value: unknown, updatedBy?: string) {
    const existing = await this.prisma.controlSetting.findFirst({ where: { tenantId, key } });
    if (existing) {
      return this.prisma.controlSetting.update({ where: { id: existing.id }, data: { value: value as any, updatedBy } });
    }
    return this.prisma.controlSetting.create({ data: { tenantId, key, value: value as any, updatedBy } });
  }

  private async liveViewSessions(): Promise<PlatformLiveViewSessionDto[]> {
    const row = await this.prisma.controlSetting.findFirst({ where: { tenantId: null, key: LIVE_VIEW_KEY } });
    return (row?.value || []) as unknown as PlatformLiveViewSessionDto[];
  }

  private async platformAuditEvents() {
    const rows = await this.prisma.auditLog.findMany({ where: { action: { startsWith: "platform." } }, orderBy: { createdAt: "desc" }, take: 40 });
    return rows.map((row) => ({ id: row.id, tenantId: row.tenantId || undefined, action: row.action, targetType: row.targetType, targetId: row.targetId || undefined, reason: row.reason || undefined, riskLevel: (row.after as any)?.riskLevel, createdAt: row.createdAt.toISOString() }));
  }

  private async platformAudit(session: RequestSessionContext, tenantId: string | undefined, action: string, targetType: string, targetId: string, reason: string, riskLevel: PlatformRiskLevel, after: object) {
    return this.prisma.auditLog.create({
      data: { tenantId, actorType: AuditActorType.PLATFORM, actorId: session.accountId, actorName: session.displayName, action, targetType, targetId, reason, after: { ...after, riskLevel, rollbackAvailable: true } as Prisma.InputJsonValue }
    });
  }

  private async reloadTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { accounts: { include: { staffUser: true } }, branches: true, workOrders: true, tasks: true, partRequests: true, partReturnRequests: true, customerDecisionRequests: true, payments: true, controlSettings: true, auditLogs: { orderBy: { createdAt: "desc" }, take: 8 } }
    });
    if (!tenant) throw new NotFoundException("Workshop was not found.");
    return tenant;
  }

  private statusForTenant(tenant: any): PlatformWorkshopStatus {
    const setting = this.settingValue(tenant, "platform.tenant.status");
    if (setting) return String(setting) as PlatformWorkshopStatus;
    if (tenant.status === TenantStatus.ACTIVE) return "active";
    if (tenant.status === TenantStatus.SUSPENDED) return "suspended";
    return "trial";
  }

  private settingValue(tenant: any, key: string) {
    return tenant.controlSettings?.find((setting: any) => setting.key === key)?.value;
  }

  private toTenantStatus(status: PlatformWorkshopStatus) {
    if (status === "active") return TenantStatus.ACTIVE;
    if (status === "read_only") return TenantStatus.READ_ONLY;
    if (status === "frozen") return TenantStatus.FROZEN;
    if (status === "archived") return TenantStatus.ARCHIVED;
    if (status === "suspended") return TenantStatus.SUSPENDED;
    return TenantStatus.TRIAL;
  }

  private toCategory(value: string) {
    const normalized = String(value || "cars").toUpperCase().replace(/ /g, "_");
    if (normalized.includes("MOTOR")) return CategoryCode.MOTORCYCLES;
    if (normalized.includes("HEAVY")) return CategoryCode.HEAVY_EQUIPMENT;
    return CategoryCode.CARS;
  }

  private async uniqueSlug(name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `workshop-${Date.now()}`;
    let slug = base;
    let index = 1;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) slug = `${base}-${index++}`;
    return slug;
  }

}
