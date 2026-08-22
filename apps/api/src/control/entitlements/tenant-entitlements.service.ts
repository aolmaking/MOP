import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";

export const ENTITLEMENT_OVERRIDE_TYPE = "limit_entitlement_override";

export const ENTITLEMENT_FIELDS = ["maxBranches", "maxUsers", "maxWarehouses", "allowedExports"] as const;
export type EntitlementField = (typeof ENTITLEMENT_FIELDS)[number];

type NumericEntitlementField = "maxBranches" | "maxUsers" | "maxWarehouses";
type ListEntitlementField = "allowedExports";

const NUMERIC_FIELDS: readonly NumericEntitlementField[] = ["maxBranches", "maxUsers", "maxWarehouses"];
const LIST_FIELDS: readonly ListEntitlementField[] = ["allowedExports"];

type EntitlementClient = Pick<Prisma.TransactionClient, "tenant" | "controlSetting" | "branch" | "staffUser" | "warehouse">;

export interface EntitlementActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface EffectivePlanEntitlements {
  readonly maxBranches: number;
  readonly maxUsers: number;
  readonly maxWarehouses: number;
  readonly allowedModules: readonly string[];
  readonly allowedExports: readonly string[];
}

export interface EntitlementOverrideSummary {
  readonly id: string;
  readonly field: EntitlementField;
  readonly value: number | readonly string[];
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly active: boolean;
}

export interface EntitlementFieldSummary {
  readonly field: EntitlementField;
  readonly label: string;
  readonly kind: "number" | "list";
  readonly planDefault: number | readonly string[];
  readonly effective: number | readonly string[];
  readonly usage?: number;
  readonly options?: readonly string[];
  readonly override: EntitlementOverrideSummary | null;
}

export interface TenantEntitlementsSummary {
  readonly tenant: { readonly id: string; readonly name: string; readonly plan: { readonly id: string; readonly code: string; readonly name: string } };
  readonly usage: { readonly branches: number; readonly users: number; readonly warehouses: number };
  readonly fields: readonly EntitlementFieldSummary[];
}

interface TenantEntitlementBase {
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly plan: {
      readonly id: string;
      readonly code: string;
      readonly name: string;
      readonly maxBranches: number;
      readonly maxUsers: number;
      readonly maxWarehouses: number;
      readonly allowedModules: readonly string[];
      readonly allowedExports: readonly string[];
    };
  };
  readonly usage: { readonly branches: number; readonly users: number; readonly warehouses: number };
  readonly overrides: ReadonlyMap<EntitlementField, EntitlementOverrideSummary>;
}

/**
 * Effective per-workshop limits.
 *
 * Plan fields remain the ceiling. PLATFORM-scoped ControlSetting rows can
 * narrow a workshop below that default, with the same close-old/open-new
 * history discipline as role permission locks. This is intentionally not a
 * second plan model: without a tenant override, the plan row is the answer.
 */
@Injectable()
export class TenantEntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async current(tenantId: string, client: EntitlementClient = this.prisma): Promise<TenantEntitlementsSummary> {
    const base = await this.loadBase(tenantId, client);
    const effective = this.effectiveFrom(base);
    return {
      tenant: {
        id: base.tenant.id,
        name: base.tenant.name,
        plan: { id: base.tenant.plan.id, code: base.tenant.plan.code, name: base.tenant.plan.name },
      },
      usage: base.usage,
      fields: [
        this.numberField("maxBranches", "Max Branches", base.tenant.plan.maxBranches, effective.maxBranches, base.usage.branches, base),
        this.numberField("maxUsers", "Max Users", base.tenant.plan.maxUsers, effective.maxUsers, base.usage.users, base),
        this.numberField(
          "maxWarehouses",
          "Max Warehouses",
          base.tenant.plan.maxWarehouses,
          effective.maxWarehouses,
          base.usage.warehouses,
          base,
        ),
        this.listField("allowedExports", "Allowed Exports", base.tenant.plan.allowedExports, effective.allowedExports, base),
      ],
    };
  }

  async effectivePlanForTenant(tenantId: string, client: EntitlementClient = this.prisma): Promise<EffectivePlanEntitlements> {
    const base = await this.loadBase(tenantId, client);
    return this.effectiveFrom(base);
  }

  async setNumberOverride(
    tenantId: string,
    field: NumericEntitlementField,
    value: number,
    reason: string,
    actor: EntitlementActor,
  ): Promise<TenantEntitlementsSummary> {
    return this.prisma.$transaction(async (tx) => {
      const base = await this.loadBase(tenantId, tx);
      this.assertNumberOverrideAllowed(base, field, value);
      await this.writeOverride(tenantId, field, value, reason, actor, tx, base);
      return this.current(tenantId, tx);
    });
  }

  async setListOverride(
    tenantId: string,
    field: ListEntitlementField,
    value: readonly string[],
    reason: string,
    actor: EntitlementActor,
  ): Promise<TenantEntitlementsSummary> {
    return this.prisma.$transaction(async (tx) => {
      const base = await this.loadBase(tenantId, tx);
      const normalized = uniqueStrings(value);
      this.assertListOverrideAllowed(base, field, normalized);
      await this.writeOverride(tenantId, field, normalized, reason, actor, tx, base);
      return this.current(tenantId, tx);
    });
  }

  async clearOverride(tenantId: string, field: EntitlementField, reason: string, actor: EntitlementActor): Promise<TenantEntitlementsSummary> {
    return this.prisma.$transaction(async (tx) => {
      const key = keyFor(field);
      const previous = await tx.controlSetting.findFirst({
        where: { tenantId, scope: "PLATFORM", type: ENTITLEMENT_OVERRIDE_TYPE, key, active: true },
      });
      if (!previous) {
        throw new NotFoundException({ code: "entitlement_override_not_found", message: "No active override exists for that field." });
      }

      const base = await this.loadBase(tenantId, tx);
      const before = this.effectiveFrom(base);
      if (isNumericEntitlementField(field)) {
        const planDefault = base.tenant.plan[field];
        const used = usageFor(base, field);
        if (planDefault < used) {
          throw new ConflictException({
            code: "below_current_usage",
            message: `Clearing this override would lower ${field} to ${planDefault}, but current usage is ${used}.`,
          });
        }
      }
      await tx.controlSetting.update({ where: { id: previous.id }, data: { active: false } });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "PLATFORM",
          actorName: actor.displayName,
          targetType: "ControlSetting",
          targetId: previous.id,
          action: "governance.entitlement_override.removed",
          before: { field, value: before[field] },
          after: null,
          reason,
          riskLevel: "HIGH",
        },
        tx,
      );

      return this.current(tenantId, tx);
    });
  }

  async assertCanAddBranch(tenantId: string, client: EntitlementClient = this.prisma): Promise<void> {
    const current = await this.current(tenantId, client);
    const max = numberFieldValue(current, "maxBranches");
    if (current.usage.branches >= max) {
      throw new ConflictException({
        code: "max_branches_reached",
        message: `This workshop is limited to ${max} active branch(es). Increase the limit before adding another branch.`,
      });
    }
  }

  async assertCanAddUser(tenantId: string, client: EntitlementClient = this.prisma): Promise<void> {
    const current = await this.current(tenantId, client);
    const max = numberFieldValue(current, "maxUsers");
    if (current.usage.users >= max) {
      throw new ConflictException({
        code: "max_users_reached",
        message: `This workshop is limited to ${max} active user(s). Increase the limit before inviting or reactivating another staff member.`,
      });
    }
  }

  async assertCanAddWarehouse(tenantId: string, client: EntitlementClient = this.prisma): Promise<void> {
    const current = await this.current(tenantId, client);
    const max = numberFieldValue(current, "maxWarehouses");
    if (current.usage.warehouses >= max) {
      throw new ConflictException({
        code: "max_warehouses_reached",
        message: `This workshop is limited to ${max} active warehouse(s). Increase the limit before adding another warehouse.`,
      });
    }
  }

  async assertExportAllowed(tenantId: string, sourcePage: string, client: EntitlementClient = this.prisma): Promise<void> {
    const effective = await this.effectivePlanForTenant(tenantId, client);
    if (!effective.allowedExports.includes(sourcePage)) {
      throw new ForbiddenException({
        code: "export_not_in_plan",
        message: "This report category is not included in this workshop's Allowed Exports entitlement.",
      });
    }
  }

  private async loadBase(tenantId: string, client: EntitlementClient): Promise<TenantEntitlementBase> {
    const [tenant, settings, branches, users, warehouses] = await Promise.all([
      client.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              maxBranches: true,
              maxUsers: true,
              maxWarehouses: true,
              allowedModules: true,
              allowedExports: true,
            },
          },
        },
      }),
      client.controlSetting.findMany({
        where: {
          tenantId,
          scope: "PLATFORM",
          type: ENTITLEMENT_OVERRIDE_TYPE,
          active: true,
          key: { in: ENTITLEMENT_FIELDS.map(keyFor) },
        },
        orderBy: { createdAt: "desc" },
      }),
      client.branch.count({ where: { tenantId, isActive: true } }),
      client.staffUser.count({ where: { tenantId, isActive: true } }),
      client.warehouse.count({ where: { tenantId, isActive: true } }),
    ]);

    if (!tenant) {
      throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });
    }

    const overrides = new Map<EntitlementField, EntitlementOverrideSummary>();
    for (const row of settings) {
      const field = fieldFromKey(row.key);
      if (!field) continue;
      const override = this.toOverride(row);
      if (override.field === field) overrides.set(field, override);
    }

    return {
      tenant,
      usage: { branches, users, warehouses },
      overrides,
    };
  }

  private effectiveFrom(base: TenantEntitlementBase): EffectivePlanEntitlements {
    return {
      maxBranches: this.effectiveNumber(base, "maxBranches"),
      maxUsers: this.effectiveNumber(base, "maxUsers"),
      maxWarehouses: this.effectiveNumber(base, "maxWarehouses"),
      allowedModules: base.tenant.plan.allowedModules,
      allowedExports: this.effectiveList(base, "allowedExports"),
    };
  }

  private effectiveNumber(base: TenantEntitlementBase, field: NumericEntitlementField): number {
    const planDefault = base.tenant.plan[field];
    const override = base.overrides.get(field)?.value;
    return typeof override === "number" ? Math.min(override, planDefault) : planDefault;
  }

  private effectiveList(base: TenantEntitlementBase, field: ListEntitlementField): readonly string[] {
    const planDefault = base.tenant.plan[field];
    const override = base.overrides.get(field)?.value;
    if (!Array.isArray(override)) return planDefault;
    return override.filter((item): item is string => typeof item === "string" && planDefault.includes(item));
  }

  private numberField(
    field: NumericEntitlementField,
    label: string,
    planDefault: number,
    effective: number,
    usage: number,
    base: TenantEntitlementBase,
  ): EntitlementFieldSummary {
    return { field, label, kind: "number", planDefault, effective, usage, override: base.overrides.get(field) ?? null };
  }

  private listField(
    field: ListEntitlementField,
    label: string,
    planDefault: readonly string[],
    effective: readonly string[],
    base: TenantEntitlementBase,
  ): EntitlementFieldSummary {
    return { field, label, kind: "list", planDefault, effective, options: planDefault, override: base.overrides.get(field) ?? null };
  }

  private assertNumberOverrideAllowed(base: TenantEntitlementBase, field: NumericEntitlementField, value: number): void {
    if (!Number.isInteger(value)) {
      throw new BadRequestException({ code: "invalid_entitlement_value", message: "Use a whole number for this entitlement." });
    }

    const planDefault = base.tenant.plan[field];
    if (value > planDefault) {
      throw new BadRequestException({
        code: "above_plan_ceiling",
        message: `This workshop's plan ceiling is ${planDefault}. Change the plan before setting a higher entitlement.`,
      });
    }

    const used = usageFor(base, field);
    if (value < used) {
      throw new ConflictException({
        code: "below_current_usage",
        message: `This workshop already uses ${used}. Reduce usage before setting a lower entitlement.`,
      });
    }

    const minimum = field === "maxWarehouses" ? 0 : 1;
    if (value < minimum) {
      throw new BadRequestException({ code: "invalid_entitlement_value", message: `This field cannot be lower than ${minimum}.` });
    }
  }

  private assertListOverrideAllowed(base: TenantEntitlementBase, field: ListEntitlementField, value: readonly string[]): void {
    const planDefault = base.tenant.plan[field];
    const outsidePlan = value.filter((item) => !planDefault.includes(item));
    if (outsidePlan.length > 0) {
      throw new BadRequestException({
        code: "outside_plan_ceiling",
        message: "This override includes values not allowed by the workshop's plan.",
        details: { values: outsidePlan },
      });
    }
  }

  private async writeOverride(
    tenantId: string,
    field: EntitlementField,
    value: number | readonly string[],
    reason: string,
    actor: EntitlementActor,
    tx: Prisma.TransactionClient,
    base: TenantEntitlementBase,
  ): Promise<void> {
    const key = keyFor(field);
    const previous = await tx.controlSetting.findFirst({
      where: { tenantId, scope: "PLATFORM", type: ENTITLEMENT_OVERRIDE_TYPE, key, active: true },
    });
    if (previous) {
      await tx.controlSetting.update({ where: { id: previous.id }, data: { active: false } });
    }

    const before = this.effectiveFrom(base);
    const created = await tx.controlSetting.create({
      data: {
        scope: "PLATFORM",
        tenantId,
        key,
        type: ENTITLEMENT_OVERRIDE_TYPE,
        value: { field, value },
        active: true,
        reason,
        createdBy: actor.accountId,
      },
    });

    await this.audit.record(
      {
        tenantId,
        actorId: actor.accountId,
        actorType: "PLATFORM",
        actorName: actor.displayName,
        targetType: "ControlSetting",
        targetId: created.id,
        action: "governance.entitlement_override.set",
        before: { field, value: before[field] },
        after: { field, value },
        reason,
        riskLevel: "HIGH",
      },
      tx,
    );
  }

  private toOverride(row: {
    id: string;
    key: string;
    value: Prisma.JsonValue;
    reason: string | null;
    createdBy: string;
    createdAt: Date;
    active: boolean;
  }): EntitlementOverrideSummary {
    const parsed = parseOverrideValue(row.value);
    return {
      id: row.id,
      field: parsed.field,
      value: parsed.value,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      active: row.active,
    };
  }
}

function keyFor(field: EntitlementField): string {
  return `limits.${field}`;
}

function fieldFromKey(key: string): EntitlementField | null {
  const field = key.replace(/^limits\./, "");
  return isEntitlementField(field) ? field : null;
}

function isEntitlementField(value: string): value is EntitlementField {
  return (ENTITLEMENT_FIELDS as readonly string[]).includes(value);
}

function isNumericEntitlementField(value: EntitlementField): value is NumericEntitlementField {
  return (NUMERIC_FIELDS as readonly string[]).includes(value);
}

function parseOverrideValue(value: Prisma.JsonValue): { field: EntitlementField; value: number | readonly string[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { field: "maxBranches", value: 0 };
  }
  const rawField = (value as { field?: unknown }).field;
  const raw = (value as { value?: unknown }).value;
  if (typeof rawField !== "string" || !isEntitlementField(rawField)) {
    return { field: "maxBranches", value: 0 };
  }
  const field = rawField;
  if ((NUMERIC_FIELDS as readonly string[]).includes(field) && typeof raw === "number") {
    return { field, value: raw };
  }
  if ((LIST_FIELDS as readonly string[]).includes(field) && Array.isArray(raw)) {
    return { field, value: raw.filter((item): item is string => typeof item === "string") };
  }
  return { field, value: (NUMERIC_FIELDS as readonly string[]).includes(field) ? 0 : [] };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function usageFor(base: TenantEntitlementBase, field: NumericEntitlementField): number {
  switch (field) {
    case "maxBranches":
      return base.usage.branches;
    case "maxUsers":
      return base.usage.users;
    case "maxWarehouses":
      return base.usage.warehouses;
  }
}

function numberFieldValue(summary: TenantEntitlementsSummary, field: NumericEntitlementField): number {
  const entry = summary.fields.find((item) => item.field === field);
  return typeof entry?.effective === "number" ? entry.effective : 0;
}
