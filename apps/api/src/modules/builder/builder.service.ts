import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActorType, Prisma } from "@prisma/client";
import type {
  BuilderConfiguration,
  BuilderDraftUpdateDto,
  BuilderHomeDto,
  BuilderPreviewRequest,
  BuilderPreviewResponse,
  BuilderPublishResult,
  BuilderRollbackResult,
  BuilderPageKey,
  OwnerConfigurationDraftDto,
  OwnerConfigurationPermissionsDto,
  OwnerLockedControlDto,
  OwnerPermissionCellDto,
  OwnerPermissionDefinition,
  OwnerPermissionImpactPreviewDto,
  OwnerRoleTemplateDto,
  OwnerScopeRuleDto,
  OwnerUserPermissionDto,
  OwnerConfigurationSectionDto
} from "@mop/shared";
import {
  applyBuilderPreset,
  buildBuilderImpactPreview,
  builderPreviewFixtures,
  createDefaultBuilderConfiguration,
  defaultPageTemplateFor,
  builderPresets,
  validateBuilderConfiguration,
  defaultRolePages,
  reportPermissionCodes,
  reportPermissionGroups,
  reportRegistry,
  rolePermissionMap,
  routeCatalog
} from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

interface BuilderHistoryEntry {
  versionId: string;
  publishedAt: string;
  publishedBy: string;
  reason?: string;
  snapshot: BuilderConfiguration;
}

const CONFIG_KEY = "builder.configuration";
const HISTORY_KEY = "builder.publish.history";
const OWNER_PERMISSION_DRAFT_KEY = "owner.configuration.permissions.draft";

const ownerPermissionRoles = ["tenant_owner", "tenant_admin", "branch_manager", "technician", "team_leader", "inventory_manager", "data_analyst", "customer"];
const permissionGroupOrder = [
  "Authentication & Access",
  "Customers",
  "Assets",
  "Work Orders",
  "Technician Tasks",
  "Inspection",
  "Customer Decisions",
  "Inventory",
  "Parts Lifecycle",
  "Branch Management",
  "Team Leader Supervision",
  ...reportPermissionGroups,
  "Builder",
  "Configuration",
  "Payments later",
  "Audit"
];

const ownerConfigurationSections: OwnerConfigurationSectionDto[] = [
  {
    id: "access-identity",
    label: "Access & Identity",
    description: "Users, login, role templates, tenant ownership, and safe user overrides.",
    permissionGroups: ["Authentication & Access", "Configuration"],
    routeIds: ["users-access", "permissions", "builder-organization-access", "builder-configuration-permissions"],
    controlledByPlatformKeys: ["owner_login", "max_users"]
  },
  {
    id: "builder-experience",
    label: "Builder & Experience",
    description: "Brand, page builder, role experience, workflow policies, forms, and messages.",
    permissionGroups: ["Builder"],
    routeIds: ["builder-home", "builder-brand-theme", "builder-page-builder", "builder-role-experience", "builder-workflow-feature", "builder-forms-fields", "builder-messages-templates"],
    controlledByPlatformKeys: ["builder", "publishing"]
  },
  {
    id: "reports-intelligence",
    label: "Reports & Intelligence",
    description: "Personal, team, branch, inventory, company, export, drill-down, and platform reporting visibility.",
    permissionGroups: [...reportPermissionGroups],
    routeIds: ["reports", "analytics-home", "analytics-operations", "analytics-people", "analytics-inventory-customer", "inventory-reports", "platform-reports", "builder-configuration-permissions"],
    controlledByPlatformKeys: ["reports", "reports_visibility", "export", "financial_reports", "inventory_value_reports", "user_performance_reports"]
  },
  {
    id: "operations",
    label: "Operations",
    description: "Customers, assets, work orders, branch workspace, delivery, and customer decisions.",
    permissionGroups: ["Customers", "Assets", "Work Orders", "Customer Decisions", "Branch Management"],
    routeIds: ["customers", "customer-decisions", "branch-home", "branch-intake", "branch-work-orders", "branch-workspace", "branch-decisions", "branch-delivery", "work-orders"],
    controlledByPlatformKeys: ["customer_portal", "customer_decision_requests", "branch_operations"]
  },
  {
    id: "technician-execution",
    label: "Technician Execution",
    description: "Technician home, My Work, Work Card, task actions, blockers, inspection, diagnostic codes, and parts activity.",
    permissionGroups: ["Technician Tasks", "Inspection", "Parts Lifecycle"],
    routeIds: ["technician", "my-work", "work-card"],
    controlledByPlatformKeys: ["technician", "finish_gate", "critical_warning_acknowledgement"]
  },
  {
    id: "inventory-stock",
    label: "Inventory & Stock",
    description: "Requests, POS catalog, quantity control, returns, movements, transfers, suppliers, and stock reports.",
    permissionGroups: ["Inventory", "Parts Lifecycle", "Reports - Inventory"],
    routeIds: ["inventory-home", "inventory-requests", "inventory-catalog", "inventory-quantity", "inventory-returns", "inventory-reports"],
    controlledByPlatformKeys: ["inventory_management", "stock_correctness", "inventory_value_reports"]
  },
  {
    id: "audit-safety",
    label: "Audit & Safety",
    description: "Audit visibility, platform locks, high-risk changes, privacy, and safety-critical controls.",
    permissionGroups: ["Audit", "Reports - Audit"],
    routeIds: ["audit", "builder-audit-rollback", "platform-control"],
    controlledByPlatformKeys: ["audit", "customer_privacy", "safety_critical_rules"]
  }
];

@Injectable()
export class BuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationEvents: OperationEventsService
  ) {}

  async home(session: RequestSessionContext): Promise<BuilderHomeDto> {
    const config = await this.getDraft(session);
    const validation = validateBuilderConfiguration(config);
    const impact = buildBuilderImpactPreview(config);
    const publishedVersions = config.versions.filter((item) => item.status === "published");
    return {
      activeVersionId: config.activeVersionId,
      draftVersionId: config.draftVersionId,
      lastPublishedAt: publishedVersions[publishedVersions.length - 1]?.publishedAt,
      publishedVersionCount: publishedVersions.length,
      draftChangeCount: config.activeVersionId === config.draftVersionId ? 0 : 1,
      pagesCustomized: config.pageTemplates.length,
      rolesAffected: [...new Set([
        ...config.pageTemplates.map((page) => page.role),
        ...config.featurePolicies.flatMap((policy) => policy.affectedRoles),
        ...config.workflowPolicies.flatMap((policy) => policy.affectedRoles)
      ])],
      validation,
      impact
    };
  }

  async getDraft(session: RequestSessionContext): Promise<BuilderConfiguration> {
    const tenantId = this.requireTenant(session);
    const existing = await this.prisma.controlSetting.findFirst({ where: { tenantId, key: CONFIG_KEY } });
    if (existing?.value) {
      const normalized = this.normalizeConfig(existing.value as unknown as BuilderConfiguration, tenantId);
      if (JSON.stringify(normalized) !== JSON.stringify(existing.value)) {
        await this.saveSetting(tenantId, CONFIG_KEY, normalized, session.userId);
      }
      return normalized;
    }

    const config = createDefaultBuilderConfiguration(tenantId);
    await this.saveSetting(tenantId, CONFIG_KEY, config, session.userId);
    await this.saveHistory(tenantId, [{
      versionId: config.activeVersionId,
      publishedAt: config.versions[0].publishedAt || config.versions[0].createdAt,
      publishedBy: "system",
      reason: "Default Builder baseline.",
      snapshot: config
    }], session.userId);
    return config;
  }

  async updateDraft(session: RequestSessionContext, input: BuilderDraftUpdateDto): Promise<BuilderConfiguration> {
    const tenantId = this.requireTenant(session);
    const current = await this.getDraft(session);
    const next: BuilderConfiguration = {
      ...current,
      designTokens: { ...current.designTokens, ...(input.designTokens || {}) },
      pageTemplates: input.pageTemplates || current.pageTemplates,
      roleExperiences: input.roleExperiences || current.roleExperiences,
      featurePolicies: input.featurePolicies || current.featurePolicies,
      workflowPolicies: input.workflowPolicies || current.workflowPolicies,
      formSchemas: input.formSchemas || current.formSchemas,
      messageTemplates: input.messageTemplates || current.messageTemplates,
      draftVersionId: current.draftVersionId === current.activeVersionId ? `draft-${Date.now()}` : current.draftVersionId
    };

    await this.saveSetting(tenantId, CONFIG_KEY, next, session.userId);
    await this.audit(session, "builder.draft.updated", "builder_configuration", tenantId, input.reason || "Builder draft updated.", {
      activeVersionId: current.activeVersionId,
      draftVersionId: next.draftVersionId,
      touchedAreas: Object.keys(input).filter((key) => key !== "reason")
    });
    return next;
  }

  async preview(session: RequestSessionContext, input: BuilderPreviewRequest): Promise<BuilderPreviewResponse> {
    const config = await this.getDraft(session);
    const page = config.pageTemplates.find((template) => template.pageKey === input.pageKey && template.role === input.asRole)
      || config.pageTemplates.find((template) => template.pageKey === input.pageKey);
    if (!page) throw new NotFoundException("Builder page template was not found.");
    const previewIdentity = input.asIdentityId
      ? config.previewIdentities.find((identity) => identity.id === input.asIdentityId)
      : config.previewIdentities.find((identity) => identity.role === input.asRole);
    return {
      configVersionId: input.versionId || config.draftVersionId,
      page: {
        ...page,
        sections: [...page.sections].filter((section) => section.enabled).sort((a, b) => a.order - b.order)
      },
      designTokens: config.designTokens,
      roleExperience: config.roleExperiences.find((role) => role.role === input.asRole),
      previewIdentity,
      device: input.device || "desktop",
      previewMode: true,
      readonlyActions: ["request_part", "mark_used", "send_customer_decision", "finish_task", "publish", "rollback"],
      scenarioFixtureKeys: previewIdentity?.scenarioFixtureKeys || [],
      scenarioFixtures: Object.fromEntries((previewIdentity?.scenarioFixtureKeys || []).map((key) => [key, builderPreviewFixtures[key]])),
      validation: validateBuilderConfiguration(config)
    };
  }

  async validate(session: RequestSessionContext) {
    const config = await this.getDraft(session);
    return validateBuilderConfiguration(config);
  }

  async impact(session: RequestSessionContext) {
    return buildBuilderImpactPreview(await this.getDraft(session));
  }

  presets() {
    return builderPresets;
  }

  async applyPreset(session: RequestSessionContext, presetId: string) {
    const tenantId = this.requireTenant(session);
    const current = await this.getDraft(session);
    if (!builderPresets.some((preset) => preset.id === presetId)) throw new NotFoundException("Builder preset was not found.");
    const next = {
      ...applyBuilderPreset(current, presetId),
      draftVersionId: current.draftVersionId === current.activeVersionId ? `draft-${Date.now()}` : current.draftVersionId
    };
    await this.saveSetting(tenantId, CONFIG_KEY, next, session.userId);
    await this.audit(session, "builder.preset.applied", "builder_configuration", tenantId, `Builder preset ${presetId} applied to draft.`, {
      presetId,
      impact: buildBuilderImpactPreview(next)
    });
    return next;
  }

  async discardDraft(session: RequestSessionContext) {
    const tenantId = this.requireTenant(session);
    const current = await this.getDraft(session);
    const history = await this.loadHistory(tenantId);
    const active = history.find((entry) => entry.versionId === current.activeVersionId) || history[history.length - 1];
    if (!active) throw new NotFoundException("No published Builder version is available to restore.");
    const restored = this.normalizeConfig({
      ...active.snapshot,
      tenantId,
      draftVersionId: `draft-${Date.now()}`
    }, tenantId);
    await this.saveSetting(tenantId, CONFIG_KEY, restored, session.userId);
    await this.audit(session, "builder.draft.discarded", "builder_configuration", tenantId, "Builder draft discarded and restored from active published version.", {
      activeVersionId: restored.activeVersionId
    });
    return restored;
  }

  async resetPage(session: RequestSessionContext, pageKey: BuilderPageKey) {
    const tenantId = this.requireTenant(session);
    const current = await this.getDraft(session);
    const defaultPage = defaultPageTemplateFor(pageKey);
    if (!defaultPage) throw new NotFoundException("Default Builder page template was not found.");
    const next = {
      ...current,
      pageTemplates: current.pageTemplates.map((page) => page.pageKey === pageKey ? { ...defaultPage, versionId: current.draftVersionId } : page),
      draftVersionId: current.draftVersionId === current.activeVersionId ? `draft-${Date.now()}` : current.draftVersionId
    };
    await this.saveSetting(tenantId, CONFIG_KEY, next, session.userId);
    await this.audit(session, "builder.page.reset", "page_template", pageKey, `Builder page ${pageKey} reset to platform default.`);
    return next;
  }

  async resetSection(session: RequestSessionContext, pageKey: BuilderPageKey, sectionId: string) {
    const tenantId = this.requireTenant(session);
    const current = await this.getDraft(session);
    const defaultPage = defaultPageTemplateFor(pageKey);
    if (!defaultPage) throw new NotFoundException("Default Builder page template was not found.");
    const defaultSection = defaultPage.sections.find((section) => section.id === sectionId);
    if (!defaultSection) throw new NotFoundException("Default Builder section was not found.");
    const next = {
      ...current,
      pageTemplates: current.pageTemplates.map((page) => page.pageKey === pageKey ? {
        ...page,
        sections: page.sections.map((section) => section.id === sectionId ? { ...defaultSection, order: section.order, enabled: true, restoredAt: new Date().toISOString() } : section)
      } : page)
    };
    await this.saveSetting(tenantId, CONFIG_KEY, next, session.userId);
    await this.audit(session, "builder.section.reset", "page_section", sectionId, `Builder section ${sectionId} reset to default.`, { pageKey });
    return next;
  }

  async publish(session: RequestSessionContext, reason?: string): Promise<BuilderPublishResult> {
    const tenantId = this.requireTenant(session);
    const config = await this.getDraft(session);
    const validation = validateBuilderConfiguration(config);
    const impact = buildBuilderImpactPreview(config);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Builder draft cannot be published while validation errors exist.",
        validation
      });
    }
    if (impact.riskLevel === "high" && !reason?.trim()) {
      throw new BadRequestException({
        message: "High-risk Builder changes require a publish reason.",
        impact
      });
    }

    const publishedAt = new Date().toISOString();
    const publishedVersionId = `published-${Date.now()}`;
    const nextDraftVersionId = `draft-${Date.now() + 1}`;
    const next: BuilderConfiguration = {
      ...config,
      activeVersionId: publishedVersionId,
      draftVersionId: nextDraftVersionId,
      versions: [
        ...config.versions.map((version) => version.status === "draft" ? { ...version, status: "archived" as const } : version),
        {
          id: publishedVersionId,
          status: "published",
          versionNumber: config.versions.length + 1,
          createdAt: publishedAt,
          publishedAt,
          publishedBy: session.userId || session.accountId,
          reason
        },
        {
          id: nextDraftVersionId,
          status: "draft",
          versionNumber: config.versions.length + 2,
          createdAt: publishedAt,
          reason: "Post-publish draft."
        }
      ],
      pageTemplates: config.pageTemplates.map((page) => ({ ...page, versionId: publishedVersionId }))
    };

    await this.saveSetting(tenantId, CONFIG_KEY, next, session.userId);
    const history = await this.loadHistory(tenantId);
    await this.saveHistory(tenantId, [...history, {
      versionId: publishedVersionId,
      publishedAt,
      publishedBy: session.userId || session.accountId,
      reason,
      snapshot: next
    }], session.userId);
    await this.audit(session, "builder.published", "builder_configuration", publishedVersionId, reason || "Tenant Builder configuration published.", {
      activeVersionId: publishedVersionId,
      validationWarnings: validation.warnings.length,
      riskLevel: impact.riskLevel,
      impact
    });
    await this.operationEvents.emitFromSession(session, {
      eventKey: "builder.published",
      tenantId,
      statusChanges: [
        { entityType: "tenant_control", entityId: publishedVersionId, toStatus: "PUBLISHED", label: "Builder configuration published" }
      ],
      notificationTargets: ["tenant_owner", "reports_engine"],
      pageUpdates: ["builder-publish-center", "builder-audit-rollback", "audit"],
      reportHooks: [
        { reportKey: "reports.permissions_audit.view", metric: "builder_published", delta: 1, scope: ["company"] }
      ],
      auditAction: "builder.published",
      canUndo: true,
      payload: {
        active_version_id: publishedVersionId,
        risk_level: impact.riskLevel,
        affected_roles: impact.affectedRoles,
        affected_pages: impact.affectedPages
      },
      reason: reason || "Tenant Builder configuration published.",
      targetType: "builder_configuration",
      targetId: publishedVersionId
    });

    return { activeVersionId: publishedVersionId, publishedAt, validation, impact };
  }

  async rollback(session: RequestSessionContext, versionId: string): Promise<BuilderRollbackResult> {
    const tenantId = this.requireTenant(session);
    const history = await this.loadHistory(tenantId);
    const target = history.find((entry) => entry.versionId === versionId);
    if (!target) throw new NotFoundException("Published Builder version was not found.");

    const now = new Date().toISOString();
    const restored: BuilderConfiguration = {
      ...target.snapshot,
      tenantId,
      activeVersionId: target.versionId,
      draftVersionId: `draft-${Date.now()}`,
      versions: [
        ...target.snapshot.versions,
        {
          id: `draft-${Date.now()}`,
          status: "draft",
          versionNumber: target.snapshot.versions.length + 1,
          createdAt: now,
          reason: `Rollback draft created from ${target.versionId}.`
        }
      ]
    };
    const validation = validateBuilderConfiguration(restored);
    await this.saveSetting(tenantId, CONFIG_KEY, restored, session.userId);
    await this.audit(session, "builder.rollback", "builder_configuration", target.versionId, `Builder rolled back to ${target.versionId}.`, {
      rolledBackToVersionId: target.versionId,
      validationErrors: validation.errors.length
    });
    return { activeVersionId: restored.activeVersionId, rolledBackToVersionId: target.versionId, validation };
  }

  async history(session: RequestSessionContext) {
    const tenantId = this.requireTenant(session);
    return (await this.loadHistory(tenantId)).map((entry) => ({
      versionId: entry.versionId,
      publishedAt: entry.publishedAt,
      publishedBy: entry.publishedBy,
      reason: entry.reason
    }));
  }

  async configurationPermissions(session: RequestSessionContext): Promise<OwnerConfigurationPermissionsDto> {
    const tenantId = this.requireTenant(session);
    const draft = await this.loadOwnerPermissionDraft(tenantId);
    if (draft) return this.composeOwnerConfiguration(session, draft);
    return this.composeOwnerConfiguration(session);
  }

  async saveConfigurationPermissionsDraft(session: RequestSessionContext, input: OwnerConfigurationDraftDto) {
    const tenantId = this.requireTenant(session);
    const workspace = await this.composeOwnerConfiguration(session, input);
    await this.saveSetting(tenantId, OWNER_PERMISSION_DRAFT_KEY, {
      roleTemplates: workspace.roleTemplates,
      userPermissions: workspace.userPermissions,
      scopeRules: workspace.scopeRules,
      reason: input.reason || "Owner permission draft saved.",
      savedAt: new Date().toISOString()
    }, session.userId);
    await this.audit(session, "owner.configuration.permissions.draft_saved", "permission_configuration", tenantId, input.reason || "Owner permission draft saved.", {
      impact: workspace.draftImpact
    });
    return workspace;
  }

  async previewConfigurationPermissions(session: RequestSessionContext, input?: OwnerConfigurationDraftDto): Promise<OwnerPermissionImpactPreviewDto> {
    return (await this.composeOwnerConfiguration(session, input)).draftImpact;
  }

  async applyConfigurationPermissions(session: RequestSessionContext, input: OwnerConfigurationDraftDto) {
    const tenantId = this.requireTenant(session);
    const workspace = await this.composeOwnerConfiguration(session, input);
    if (!workspace.draftImpact.canApply) {
      throw new BadRequestException({
        message: "Permission changes cannot be applied while platform conflicts exist.",
        impact: workspace.draftImpact
      });
    }

    await this.prisma.$transaction(async (tx) => {
      for (const template of workspace.roleTemplates) {
        const permissionTemplate = await tx.permissionTemplate.upsert({
          where: { tenantId_code: { tenantId, code: template.id } },
          create: { tenantId, code: template.id, label: template.name, description: `Owner-managed template for ${template.baseRole}.` },
          update: { label: template.name, description: `Owner-managed template for ${template.baseRole}.` }
        });
        for (const cell of template.permissions) {
          if (cell.locked) continue;
          await tx.rolePermission.upsert({
            where: { tenantId_role_permission: { tenantId, role: template.baseRole, permission: cell.permission } },
            create: { tenantId, role: template.baseRole, permission: cell.permission, enabled: cell.effectiveValue, permissionTemplateId: permissionTemplate.id },
            update: { enabled: cell.effectiveValue, permissionTemplateId: permissionTemplate.id }
          });
        }
      }

      for (const user of workspace.userPermissions) {
        const roleTemplate = workspace.roleTemplates.find((template) => template.baseRole === user.role);
        const templateValues = new Map((roleTemplate?.permissions || []).map((cell) => [cell.permission, cell.effectiveValue]));
        const overrides = Object.fromEntries(
          (user.permissions || [])
            .filter((cell) => templateValues.has(cell.permission) && templateValues.get(cell.permission) !== cell.effectiveValue && !cell.locked)
            .map((cell) => [cell.permission, cell.effectiveValue])
        );
        await tx.staffUser.update({
          where: { id: user.userId },
          data: {
            branchScope: user.branchScope,
            warehouseScope: user.warehouseScope,
            categoryScope: user.categoryScope as any,
            teamScope: user.teamScope,
            userOverrides: overrides,
            permissionTemplateId: user.templateId || undefined
          }
        });
      }
    });

    await this.saveSetting(tenantId, OWNER_PERMISSION_DRAFT_KEY, {
      roleTemplates: workspace.roleTemplates,
      userPermissions: workspace.userPermissions,
      scopeRules: workspace.scopeRules,
      reason: input.reason || "Owner permission changes applied.",
      appliedAt: new Date().toISOString()
    }, session.userId);
    await this.audit(session, "owner.configuration.permissions.applied", "permission_configuration", tenantId, input.reason || "Owner permission changes applied.", {
      impact: workspace.draftImpact,
      affectedRoles: workspace.draftImpact.affectedRoles,
      affectedUsers: workspace.draftImpact.affectedUsers
    });
    await this.operationEvents.emitFromSession(session, {
      eventKey: "owner.permission_changed",
      tenantId,
      statusChanges: [
        { entityType: "tenant_control", entityId: tenantId, toStatus: "PERMISSIONS_APPLIED", label: "Owner configuration permissions applied" }
      ],
      notificationTargets: ["tenant_owner", "data_analyst", "reports_engine"],
      pageUpdates: ["builder-configuration-permissions", "reports", "analytics-home"],
      reportHooks: [
        { reportKey: "reports.permissions_audit.view", metric: "permission_configuration_applied", delta: 1, scope: ["company"] }
      ],
      auditAction: "owner.configuration.permissions.applied",
      canUndo: true,
      payload: {
        affected_roles: workspace.draftImpact.affectedRoles,
        affected_users: workspace.draftImpact.affectedUsers,
        affected_pages: workspace.draftImpact.affectedPages,
        platform_conflicts: workspace.draftImpact.platformConflicts
      },
      reason: input.reason || "Owner permission changes applied.",
      targetType: "permission_configuration",
      targetId: tenantId
    });
    return workspace;
  }

  async resetConfigurationRoleTemplate(session: RequestSessionContext, role: string) {
    const tenantId = this.requireTenant(session);
    const workspace = await this.composeOwnerConfiguration(session);
    const template = workspace.roleTemplates.find((item) => item.baseRole === role);
    if (!template) throw new NotFoundException("Role template was not found.");
    template.permissions = this.permissionDefinitions().map((definition) => this.permissionCell(definition.code, rolePermissionMap[role]?.includes(definition.code) || false, role, workspace.lockedByPlatform));
    await this.saveConfigurationPermissionsDraft(session, {
      roleTemplates: workspace.roleTemplates,
      userPermissions: workspace.userPermissions,
      scopeRules: workspace.scopeRules,
      reason: `Role template ${role} reset to system default.`
    });
    return this.configurationPermissions(session);
  }

  private async composeOwnerConfiguration(session: RequestSessionContext, draft?: OwnerConfigurationDraftDto): Promise<OwnerConfigurationPermissionsDto> {
    const tenantId = this.requireTenant(session);
    const [staffUsers, permissions, controlSettings, auditRows] = await Promise.all([
      this.prisma.staffUser.findMany({ where: { tenantId }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
      this.prisma.rolePermission.findMany({ where: { tenantId } }),
      this.prisma.controlSetting.findMany({ where: { OR: [{ tenantId }, { tenantId: null }] }, orderBy: { updatedAt: "desc" } }),
      this.prisma.auditLog.findMany({ where: { tenantId, action: { startsWith: "owner.configuration.permissions" } }, orderBy: { createdAt: "desc" }, take: 30 })
    ]);
    const definitions = this.permissionDefinitions();
    const lockedByPlatform = this.lockedControls(controlSettings, staffUsers.length);
    const permissionRows = permissions.map((row) => ({ role: row.role, permission: row.permission, enabled: row.enabled }));

    const roleTemplates = (draft?.roleTemplates?.length ? draft.roleTemplates : ownerPermissionRoles.map((role) => {
      const usersCount = staffUsers.filter((user) => user.role === role).length;
      return {
        id: `tpl_${role}`,
        name: `${this.prettyLabel(role)} Default`,
        baseRole: role,
        systemDefault: true,
        usersCount,
        permissions: definitions.map((definition) => {
          const existing = permissionRows.find((row) => row.role === role && row.permission === definition.code);
          const allowed = existing ? existing.enabled : Boolean(rolePermissionMap[role]?.includes(definition.code));
          return this.permissionCell(definition.code, allowed, role, lockedByPlatform);
        })
      } satisfies OwnerRoleTemplateDto;
    })).map((template) => ({
      ...template,
      usersCount: staffUsers.filter((user) => user.role === template.baseRole).length,
      permissions: template.permissions.map((cell) => this.permissionCell(cell.permission, cell.effectiveValue, template.baseRole, lockedByPlatform))
    }));

    const userPermissions = (draft?.userPermissions?.length ? draft.userPermissions : staffUsers.map((user) => {
      const roleTemplate = roleTemplates.find((template) => template.baseRole === user.role);
      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        templateId: user.permissionTemplateId || roleTemplate?.id,
        branchScope: user.branchScope || [],
        warehouseScope: user.warehouseScope || [],
        categoryScope: (user.categoryScope || []).map(String),
        teamScope: user.teamScope || [],
        reportScope: user.branchScope || [],
        builderScope: user.role === "tenant_owner" || user.role === "tenant_admin" ? ["all_builder_areas"] : [],
        overridesCount: Object.keys((user.userOverrides as Record<string, boolean> | null) || {}).length,
        permissions: (roleTemplate?.permissions || []).map((cell) => {
          const override = (user.userOverrides as Record<string, boolean> | null)?.[cell.permission];
          return override === undefined ? cell : { ...cell, effectiveValue: override, source: "user_override" as const };
        })
      } satisfies OwnerUserPermissionDto;
    })).map((user) => {
      const roleTemplate = roleTemplates.find((template) => template.baseRole === user.role);
      return {
        ...user,
        permissions: (user.permissions?.length ? user.permissions : roleTemplate?.permissions || []).map((cell) => this.permissionCell(cell.permission, cell.effectiveValue, user.role, lockedByPlatform))
      };
    });

    const scopeRules = draft?.scopeRules?.length ? draft.scopeRules : userPermissions.map((user) => ({
      targetType: "user" as const,
      targetId: user.userId,
      branchScope: user.branchScope,
      warehouseScope: user.warehouseScope,
      categoryScope: user.categoryScope,
      teamScope: user.teamScope,
      customerScope: user.role === "customer" ? ["own_customer_record"] : [],
      reportScope: user.reportScope,
      builderScope: user.builderScope
    }));

    return {
      configurationSections: ownerConfigurationSections,
      permissionGroups: permissionGroupOrder,
      permissionDefinitions: definitions,
      roleTemplates,
      userPermissions,
      matrixRows: roleTemplates,
      scopeRules,
      lockedByPlatform,
      changeHistory: auditRows.map((row) => ({
        id: row.id,
        whoChanged: row.actorName,
        whatChanged: row.action,
        before: row.before,
        after: row.after,
        affectedUsers: Number((row.after as any)?.impact?.affectedUsers || (row.after as any)?.affectedUsers || 0),
        reason: row.reason || undefined,
        timestamp: row.createdAt.toISOString(),
        rollbackAvailable: Boolean((row.after as any)?.rollbackAvailable)
      })),
      draftImpact: this.ownerPermissionImpact(roleTemplates, userPermissions)
    };
  }

  private ownerPermissionImpact(roleTemplates: OwnerRoleTemplateDto[], userPermissions: OwnerUserPermissionDto[]): OwnerPermissionImpactPreviewDto {
    const conflicts = roleTemplates.flatMap((template) => template.permissions)
      .filter((cell) => cell.locked && cell.effectiveValue)
      .map((cell) => ({ permission: cell.permission, reason: cell.reason || "Locked by platform or plan." }));
    const affectedRoles = [...new Set(roleTemplates.map((template) => template.baseRole))];
    const affectedActions = [...new Set(roleTemplates.flatMap((template) => template.permissions.filter((cell) => cell.effectiveValue).map((cell) => cell.permission)))].slice(0, 24);
    const affectedPages = routeCatalog
      .filter((route) => affectedRoles.some((role) => (defaultRolePages[role] || []).includes(route.id)))
      .map((route) => route.id);
    return {
      affectedUsers: userPermissions.length,
      affectedRoles,
      affectedPages,
      affectedActions,
      platformConflicts: conflicts,
      canApply: conflicts.length === 0
    };
  }

  private permissionCell(permission: string, allowed: boolean, role: string, lockedControls: OwnerLockedControlDto[]): OwnerPermissionCellDto {
    const platformLock = this.lockReasonForPermission(permission, lockedControls);
    if (platformLock) {
      return {
        permission,
        state: platformLock.source === "plan_limit" ? "locked_by_plan" : "locked_by_platform",
        effectiveValue: false,
        source: platformLock.source,
        locked: true,
        reason: platformLock.reason || `${permission} is locked by ${platformLock.source}.`
      };
    }
    const roleDefault = Boolean(rolePermissionMap[role]?.includes(permission));
    return {
      permission,
      state: allowed ? "allowed" : roleDefault ? "inherited" : "denied",
      effectiveValue: allowed,
      source: allowed === roleDefault ? "role_template" : "tenant_configuration",
      locked: false
    };
  }

  private lockReasonForPermission(permission: string, locks: OwnerLockedControlDto[]) {
    return locks.find((lock) => {
      const key = lock.controlKey.toLowerCase();
      if (key.includes("inventory") && (permission.startsWith("inventory.") || permission.startsWith("parts."))) return true;
      if (key.includes("customer_portal") && permission.startsWith("customer.")) return true;
      if (key.includes("customer_decision") && permission.startsWith("customer_decision.")) return true;
      if (key.includes("technician") && (permission.startsWith("technician.") || permission.startsWith("task.") || permission.startsWith("inspection.") || permission.startsWith("diagnostic_code.") || permission.startsWith("fault."))) return true;
      if (key.includes("builder") && permission.startsWith("builder.")) return true;
      if ((key.includes("reports_visibility") || key === "reports" || key.includes("reports_module")) && permission.startsWith("reports.")) return true;
      if (key.includes("advanced_reports") && (permission.includes("drilldown") || permission.includes("builder_adoption") || permission.includes("feature_usage"))) return true;
      if ((key.includes("export") || key.includes("exports")) && permission.startsWith("reports.export")) return true;
      if (key.includes("financial_reports") && (permission.startsWith("reports.finance") || permission.includes("payment_snapshot"))) return true;
      if (key.includes("inventory_value") && permission === "reports.inventory.value.view") return true;
      if (key.includes("user_performance") && (permission.startsWith("reports.team") || permission.includes("technician_performance"))) return true;
      if (key.includes("reports") && permission.includes("reports")) return true;
      if (key.includes("max_users") && permission === "organization.users.invite") return true;
      if (key.includes("critical_warning") && permission === "customer_decision.send") return true;
      return false;
    });
  }

  private lockedControls(controlSettings: Array<{ key: string; value: unknown }>, usersCount: number): OwnerLockedControlDto[] {
    const controls: OwnerLockedControlDto[] = [];
    for (const setting of controlSettings) {
      const value = setting.value as any;
      if (setting.key.startsWith("platform.control") && (value?.active ?? true)) {
        const disabled = value?.value === false || value?.value === "locked" || value?.value === "frozen" || ["hard_disable", "locked", "frozen", "limited"].includes(value?.controlType);
        if (disabled || value?.canTenantOverride === false) {
          controls.push({
            controlName: this.prettyLabel(value?.controlKey || setting.key.split(".").pop() || "Platform Control"),
            controlKey: value?.controlKey || setting.key,
            currentValue: String(value?.value ?? value?.controlType ?? "locked"),
            source: "platform_control",
            reason: value?.reason || "Locked by MOP Platform Admin.",
            ownerCanChange: false
          });
        }
      }
      if (setting.key === "platform.entitlements") {
        const usersAllowed = Number(value?.usersAllowed || value?.maxUsers || 0);
        const branchesAllowed = Number(value?.branchesAllowed || value?.maxBranches || 0);
        if (usersAllowed && usersCount >= usersAllowed) {
          controls.push({
            controlName: "Max Users",
            controlKey: "max_users",
            currentValue: String(usersAllowed),
            source: "plan_limit",
            reason: "Current package user limit reached.",
            ownerCanChange: false
          });
        }
        if (branchesAllowed) {
          controls.push({
            controlName: "Max Branches",
            controlKey: "max_branches",
            currentValue: String(branchesAllowed),
            source: "plan_limit",
            reason: "Branch limit is controlled by current package.",
            ownerCanChange: false
          });
        }
      }
    }
    return controls;
  }

  private permissionDefinitions(): OwnerPermissionDefinition[] {
    const codes = [...new Set([...Object.values(rolePermissionMap).flat(), ...routeCatalog.map((route) => route.permission), ...reportPermissionCodes])].sort();
    return codes.map((code) => ({
      code,
      label: this.prettyLabel(code),
      group: this.permissionGroup(code),
      description: reportRegistry.find((report) => report.permission === code || report.exportPermission === code || report.drillDownPermissions.includes(code))?.title
        || `Allows ${this.prettyLabel(code).toLowerCase()} when platform and scope rules allow it.`
    }));
  }

  private permissionGroup(code: string) {
    if (code.startsWith("reports.technician") || code === "reports.personal.view") return "Reports - Personal";
    if (code.startsWith("reports.team")) return "Reports - Team";
    if (code.startsWith("reports.branch")) return "Reports - Branch";
    if (code.startsWith("reports.inventory")) return "Reports - Inventory";
    if (code.startsWith("reports.company")) return "Reports - Company";
    if (code.startsWith("reports.finance")) return "Reports - Finance";
    if (code.startsWith("reports.builder_adoption")) return "Reports - Builder Adoption";
    if (code.startsWith("reports.feature")) return "Reports - Feature Usage";
    if (code.startsWith("reports.export")) return "Reports - Export";
    if (code.startsWith("reports.drilldown")) return "Reports - Drill-down";
    if (code.startsWith("reports.audit") || code.startsWith("reports.permissions_audit")) return "Reports - Audit";
    if (code.startsWith("reports.platform") || code === "platform.reports.view") return "Reports - Platform";
    if (code === "reports.view") return "Reports - Company";
    if (code.startsWith("platform.") || code.includes("login") || code.includes("users")) return "Authentication & Access";
    if (code.startsWith("customer.") || code.startsWith("branch.customer")) return "Customers";
    if (code.startsWith("asset.") || code.includes("asset")) return "Assets";
    if (code.startsWith("work_order.") || code.startsWith("workorders") || code.includes("work_order")) return "Work Orders";
    if (code.startsWith("technician.") || code.startsWith("task.") || code === "blocker.report") return "Technician Tasks";
    if (code.startsWith("inspection") || code.startsWith("diagnostic") || code.startsWith("fault")) return "Inspection";
    if (code.startsWith("customer_decision")) return "Customer Decisions";
    if (code.startsWith("inventory.")) return "Inventory";
    if (code.startsWith("parts.")) return "Parts Lifecycle";
    if (code.startsWith("branch.") || code.startsWith("delivery.") || code.startsWith("team_setup") || code.includes("assign_to_team")) return "Branch Management";
    if (code.startsWith("team.")) return "Team Leader Supervision";
    if (code.startsWith("builder.")) return "Builder";
    if (code.startsWith("operations.")) return "Operations Integrity";
    if (code.startsWith("configuration.") || code.startsWith("organization.")) return "Configuration";
    if (code.includes("payment") || code.includes("invoice")) return "Payments later";
    if (code.startsWith("audit.")) return "Audit";
    return "Authentication & Access";
  }

  private prettyLabel(value: string) {
    return value.replace(/[_\.]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private async loadOwnerPermissionDraft(tenantId: string): Promise<OwnerConfigurationDraftDto | undefined> {
    const row = await this.prisma.controlSetting.findFirst({ where: { tenantId, key: OWNER_PERMISSION_DRAFT_KEY } });
    return row?.value as unknown as OwnerConfigurationDraftDto | undefined;
  }

  private normalizeConfig(value: BuilderConfiguration, tenantId: string): BuilderConfiguration {
    const fallback = createDefaultBuilderConfiguration(tenantId);
    return {
      ...fallback,
      ...value,
      tenantId,
      schemaVersion: value.schemaVersion || fallback.schemaVersion,
      baseTemplateVersion: value.baseTemplateVersion || fallback.baseTemplateVersion,
      lastMigratedAt: value.lastMigratedAt || fallback.lastMigratedAt,
      designTokens: { ...fallback.designTokens, ...(value.designTokens || {}) },
      pageTemplates: (value.pageTemplates || fallback.pageTemplates).map((page) => {
        const fallbackPage = fallback.pageTemplates.find((item) => item.pageKey === page.pageKey);
        return {
          ...(fallbackPage || {}),
          ...page,
          templateSchemaVersion: page.templateSchemaVersion || fallback.schemaVersion,
          baseTemplateVersion: page.baseTemplateVersion || fallback.baseTemplateVersion,
          createdFromBaseVersion: page.createdFromBaseVersion || fallback.baseTemplateVersion,
          lastMigratedAt: page.lastMigratedAt || fallback.lastMigratedAt,
          sections: page.sections.map((section) => ({
            ...section,
            defaultSettings: section.defaultSettings || section.settings || {}
          }))
        };
      }),
      roleExperiences: value.roleExperiences || fallback.roleExperiences,
      featurePolicies: value.featurePolicies || fallback.featurePolicies,
      workflowPolicies: value.workflowPolicies || fallback.workflowPolicies,
      formSchemas: (value.formSchemas || fallback.formSchemas).map((schema) => ({
        ...schema,
        fields: schema.fields.map((field) => ({
          ...field,
          fieldId: field.fieldId || `fld_${field.key}`,
          searchable: field.searchable ?? true,
          reportableLater: field.reportableLater ?? true,
          archived: field.archived ?? false,
          createdAt: field.createdAt || new Date().toISOString(),
          updatedAt: field.updatedAt || new Date().toISOString()
        }))
      })),
      messageTemplates: (value.messageTemplates || fallback.messageTemplates).map((template) => ({
        ...template,
        defaultContent: template.defaultContent || fallback.messageTemplates.find((item) => item.key === template.key)?.defaultContent || template.content,
        versionHistory: template.versionHistory || [{ versionId: "imported", content: template.content, changedAt: new Date().toISOString(), changedBy: "system", reason: "Imported from older Builder schema." }]
      })),
      previewIdentities: value.previewIdentities || fallback.previewIdentities,
      configPrecedence: value.configPrecedence || fallback.configPrecedence,
      ownerModel: value.ownerModel || fallback.ownerModel
    };
  }

  private async loadHistory(tenantId: string): Promise<BuilderHistoryEntry[]> {
    const row = await this.prisma.controlSetting.findFirst({ where: { tenantId, key: HISTORY_KEY } });
    return (row?.value || []) as unknown as BuilderHistoryEntry[];
  }

  private async saveHistory(tenantId: string, value: BuilderHistoryEntry[], updatedBy?: string) {
    await this.saveSetting(tenantId, HISTORY_KEY, value, updatedBy);
  }

  private async saveSetting(tenantId: string, key: string, value: unknown, updatedBy?: string) {
    const existing = await this.prisma.controlSetting.findFirst({ where: { tenantId, key } });
    const jsonValue = value as Prisma.InputJsonValue;
    if (existing) {
      return this.prisma.controlSetting.update({ where: { id: existing.id }, data: { value: jsonValue, updatedBy } });
    }
    return this.prisma.controlSetting.create({ data: { tenantId, key, value: jsonValue, updatedBy } });
  }

  private async audit(session: RequestSessionContext, action: string, targetType: string, targetId: string, reason: string, after?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType,
        targetId,
        reason,
        after: after as Prisma.InputJsonValue | undefined
      }
    });
  }

  private requireTenant(session: RequestSessionContext) {
    if (!session.tenantId) throw new BadRequestException("Tenant scope is required for Builder operations.");
    return session.tenantId;
  }
}
