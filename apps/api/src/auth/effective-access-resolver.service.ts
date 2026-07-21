import { Injectable } from "@nestjs/common";
import { AccountType, TenantStatus } from "@prisma/client";
import { defaultRolePages } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";

const MODULE_PERMISSION_PREFIXES: Record<string, string[]> = {
  inventory: ["inventory.", "parts."],
  finance: ["finance.", "payment.", "invoice.", "discount."],
  reports: ["reports."],
  builder: ["builder.", "configuration."],
  customer_portal: ["customer.portal.", "customer_decision.view_own", "customer_decision.respond"],
  customer_decisions: ["customer_decision."],
  technician: ["technician.", "task.", "inspection.", "fault.", "diagnostic_code."],
  branch_operations: ["branch.", "work_order.", "workorders."],
  platform: ["platform."]
};

const ROUTE_MODULES: Record<string, string> = {
  inventory: "inventory",
  "inventory-home": "inventory",
  "inventory-requests": "inventory",
  "inventory-catalog": "inventory",
  "inventory-quantity": "inventory",
  "inventory-returns": "inventory",
  "inventory-reports": "inventory",
  "pricing-catalog": "finance",
  "financial-configuration": "finance",
  "financial-dashboard": "finance",
  "invoices-payments": "finance",
  "discounts-refunds": "finance",
  "branch-invoices": "finance",
  "customer-finance": "finance",
  reports: "reports",
  "analytics-home": "reports",
  "analytics-operations": "reports",
  "analytics-people": "reports",
  "analytics-inventory-customer": "reports",
  "builder-home": "builder",
  "builder-brand-theme": "builder",
  "builder-page-builder": "builder",
  "builder-role-experience": "builder",
  "builder-workflow-feature": "builder",
  "builder-forms-fields": "builder",
  "builder-messages-templates": "builder",
  "builder-organization-access": "builder",
  "builder-configuration-permissions": "builder",
  "builder-publish-center": "builder",
  "builder-audit-rollback": "builder",
  customer: "customer_portal"
};

export interface EffectiveAccessResult {
  permissions: string[];
  permissionSources: Record<string, string>;
  pages: string[];
  enabledModules: string[];
  enabledFeatures: string[];
  builderConfigVersion?: string;
  tenantStatus?: string;
  readOnly: boolean;
  deniedRouteReasons: Record<string, string>;
}

@Injectable()
export class EffectiveAccessResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(account: any, role: string): Promise<EffectiveAccessResult> {
    const tenantId = account.tenantId as string | null;
    const [permissionRows, pageRows, controls, builder, financeConfiguration] = await Promise.all([
      this.prisma.rolePermission.findMany({ where: { role, OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])] } }),
      this.prisma.rolePage.findMany({ where: { role, OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])] } }),
      this.prisma.controlSetting.findMany({ where: { OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])] }, orderBy: { tenantId: "asc" } }),
      tenantId ? this.prisma.tenantBuilderConfiguration.findUnique({ where: { tenantId } }) : null,
      tenantId ? this.prisma.financeConfiguration.findUnique({ where: { tenantId } }) : null
    ]);

    const permissionState = new Map<string, { enabled: boolean; source: string }>();
    for (const row of permissionRows.filter((row) => row.tenantId === null)) {
      permissionState.set(row.permission, { enabled: row.enabled, source: "role_template" });
    }
    for (const row of permissionRows.filter((row) => row.tenantId === tenantId)) {
      permissionState.set(row.permission, {
        enabled: row.enabled,
        source: row.permissionTemplateId ? "tenant_configuration" : "role_template"
      });
    }

    const overrides = this.booleanRecord(account.staffUser?.userOverrides);
    for (const [permission, enabled] of Object.entries(overrides)) {
      permissionState.set(permission, { enabled, source: "user_override" });
    }

    const permissionSources: Record<string, string> = {};
    const tenantStatus = this.tenantStatus(account, controls);
    const disabledRoleKeys = this.disabledRoleKeys(controls);
    if (disabledRoleKeys.has(role.toLowerCase())) {
      return {
        permissions: [],
        permissionSources,
        pages: [],
        enabledModules: [],
        enabledFeatures: [],
        builderConfigVersion: builder?.activeVersionId,
        tenantStatus,
        readOnly: true,
        deniedRouteReasons: { '*': `${this.label(role)} role is locked by MOP Platform Admin.` }
      };
    }

    const disabledModules = this.disabledModules(controls);
    if (account.accountType === AccountType.CUSTOMER && financeConfiguration?.customerInvoiceVisible === false) {
      disabledModules.add("finance");
    }
    const enabledModules = Object.keys(MODULE_PERMISSION_PREFIXES).filter((module) => !disabledModules.has(module));
    const disabledControlKeys = this.disabledControlKeys(controls);
    const permissions = [...permissionState.entries()]
      .filter(([permission, state]) => {
        if (!state.enabled) return false;
        const blockedModule = this.permissionModule(permission);
        if (blockedModule && disabledModules.has(blockedModule)) {
          permissionSources[permission] = "platform_control";
          return false;
        }
        if (this.permissionBlockedByControl(permission, disabledControlKeys)) {
          permissionSources[permission] = "platform_control";
          return false;
        }
        permissionSources[permission] = state.source;
        return true;
      })
      .map(([permission]) => permission);

    const pageState = new Map<string, boolean>();
    for (const row of pageRows.filter((row) => row.tenantId === null)) pageState.set(row.pageId, row.enabled);
    for (const row of pageRows.filter((row) => row.tenantId === tenantId)) pageState.set(row.pageId, row.enabled);
    const configuredPages = pageRows.length ? [...pageState.entries()].filter(([, enabled]) => enabled).map(([page]) => page) : defaultRolePages[role] || [];
    const deniedRouteReasons: Record<string, string> = {};
    const pages = configuredPages.filter((page) => {
      const module = ROUTE_MODULES[page];
      if (page === "customer-finance" && disabledModules.has("finance")) {
        deniedRouteReasons[page] = "Customer invoice visibility is disabled by workshop policy.";
        return false;
      }
      if (module && disabledModules.has(module)) {
        deniedRouteReasons[page] = `${this.label(module)} is locked by MOP Platform Admin.`;
        return false;
      }
      if (this.pageBlockedByControl(page, disabledControlKeys)) {
        deniedRouteReasons[page] = `Page is locked by Platform Super Admin control.`;
        return false;
      }
      return true;
    });

    const readOnly = tenantStatus === "read_only" || this.controlEnabled(controls, ["read_only", "force_read_only"]);
    const featurePolicies = this.objectRecord(builder?.featurePolicies);
    const enabledFeatures = Object.entries(featurePolicies)
      .filter(([, value]) => value === true || this.objectRecord(value).enabled === true)
      .map(([key]) => key);

    if (["frozen", "suspended", "archived"].includes(tenantStatus)) {
      return {
        permissions: [],
        permissionSources,
        pages: [],
        enabledModules: [],
        enabledFeatures: [],
        builderConfigVersion: builder?.activeVersionId,
        tenantStatus,
        readOnly: true,
        deniedRouteReasons: { "*": `Workspace is ${tenantStatus}. Please contact MOP support.` }
      };
    }

    if (account.accountType === AccountType.CUSTOMER && disabledModules.has("customer_portal")) {
      return {
        permissions: [],
        permissionSources,
        pages: [],
        enabledModules,
        enabledFeatures,
        builderConfigVersion: builder?.activeVersionId,
        tenantStatus,
        readOnly,
        deniedRouteReasons: { customer: "Customer Portal is locked by MOP Platform Admin." }
      };
    }

    return {
      permissions,
      permissionSources,
      pages,
      enabledModules,
      enabledFeatures,
      builderConfigVersion: builder?.activeVersionId,
      tenantStatus,
      readOnly,
      deniedRouteReasons
    };
  }

  private disabledModules(controls: Array<{ key: string; value: unknown }>) {
    const disabled = new Set<string>();
    const moduleKeys = Object.keys(MODULE_PERMISSION_PREFIXES);
    for (const row of controls.filter((row) => this.disabledValue(row.value))) {
      const key = row.key.toLowerCase();
      const controlKey = key.split(".").pop() || "";

      for (const module of moduleKeys) {
        if (
          controlKey === module
          || controlKey.includes(module)
          || key.includes(`${module}_module`)
          || key.includes(`module.${module}`)
          || key.includes(`.${module}.`)
        ) {
          disabled.add(module);
        }
      }
    }
    if (controls.some((row) => row.key.includes("reports_module") && this.disabledValue(row.value))) disabled.add("reports");
    if (controls.some((row) => row.key.includes("reports_visibility") && this.disabledValue(row.value))) disabled.add("reports");
    if (controls.some((row) => row.key.includes("finance_module") && this.disabledValue(row.value))) disabled.add("finance");
    if (controls.some((row) => row.key.includes("data_visibility") && this.disabledValue(row.value))) disabled.add("finance");
    if (controls.some((row) => row.key.includes("customer_portal") && this.disabledValue(row.value))) disabled.add("customer_portal");
    return disabled;
  }

  private disabledValue(value: unknown) {
    if (value === false) return true;
    const object = this.objectRecord(value);
    return object.value === false || object.enabled === false || ["hard_disable", "soft_disable", "disabled", "locked", "frozen", "archived"].includes(String(object.controlType || object.status || "").toLowerCase());
  }

  private disabledControlKeys(controls: Array<{ key: string; value: unknown }>) {
    return controls
      .filter((row) => this.disabledValue(row.value))
      .map((row) => row.key.toLowerCase());
  }

  private disabledRoleKeys(controls: Array<{ key: string; value: unknown }>) {
    return new Set(controls
      .filter((row) => row.key.toLowerCase().includes(".role.") && this.disabledValue(row.value))
      .map((row) => row.key.toLowerCase().split(".role.").pop() || "")
      .filter(Boolean));
  }

  private permissionBlockedByControl(permission: string, disabledKeys: string[]) {
    for (const key of disabledKeys) {
      if (key.includes("reports_visibility") && permission.startsWith("reports.")) return true;
      if (key.includes("data_visibility") && permission.startsWith("finance.")) return true;
      if (key.includes("inventory") && (permission.startsWith("inventory.") || permission.startsWith("parts."))) return true;
      if (key.includes("customer_portal") && permission.startsWith("customer.")) return true;
      if (key.includes("customer_decision") && permission.startsWith("customer_decision.")) return true;
      if (key.includes("builder") && permission.startsWith("builder.")) return true;
      if (key.includes("financial_reports") && permission.startsWith("reports.finance")) return true;
      if (key.includes("export") && permission.startsWith("reports.export")) return true;
      if (key.includes("max_users") && permission === "organization.users.invite") return true;
      if (key.includes("max_branches") && permission.startsWith("branch.")) return true;
      if (key.includes("access") && permission.includes("login") && permission.includes("organization")) return true;
    }
    return false;
  }

  private pageBlockedByControl(page: string, disabledKeys: string[]) {
    for (const key of disabledKeys) {
      if (key.includes("reports_visibility") && page.startsWith("reports")) return true;
      if (key.includes("data_visibility") && page.includes("finance")) return true;
      if (key.includes("inventory") && page.startsWith("inventory")) return true;
      if (key.includes("customer_portal") && page === "customer") return true;
      if (key.includes("builder") && page.startsWith("builder")) return true;
      if (key.includes("branch_operations") && page.includes("branch")) return true;
      if (key.includes("max_branches") && page.startsWith("branch")) return true;
    }
    return false;
  }

  private controlEnabled(controls: Array<{ key: string; value: unknown }>, needles: string[]) {
    return controls.some((row) => needles.some((needle) => row.key.toLowerCase().includes(needle)) && !this.disabledValue(row.value));
  }

  private tenantStatus(account: any, controls: Array<{ key: string; value: unknown }>) {
    const control = [...controls].reverse().find((row) => row.key === "platform.tenant.status");
    const controlValue = typeof control?.value === "string" ? control.value : this.objectRecord(control?.value).value;
    const normalized = String(controlValue || account.tenant?.status || "active").toLowerCase();
    if (account.tenant?.status === TenantStatus.FROZEN) return "frozen";
    return normalized;
  }

  private permissionModule(permission: string) {
    return Object.entries(MODULE_PERMISSION_PREFIXES).find(([, prefixes]) => prefixes.some((prefix) => permission.startsWith(prefix)))?.[0];
  }

  private booleanRecord(value: unknown): Record<string, boolean> {
    const object = this.objectRecord(value);
    return Object.fromEntries(Object.entries(object).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  }

  private objectRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private label(value: string) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
