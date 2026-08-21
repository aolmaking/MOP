import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Prisma, type Tenant } from "@mop/database";
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_PAGES,
  definitionsSeededBy,
  modulesForProfile,
  grantsForResponsibilities,
  policyDefinition,
  specializationPack,
  validateDraft,
  type CapabilityKey,
  type CapabilityProfile,
  type CapabilityStatus,
} from "@mop/shared";
import type { StaffRole } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { sha256 } from "../auth/token.util";
import { SpecializationService } from "../specialization/specialization.service";
import { KNOWN_CAPABILITY_KEYS, KNOWN_CAPABILITY_STATUSES, type CreateWorkshopDto } from "./create-workshop.dto";
import { draftFromDto } from "./workshop-draft.mapper";

export interface WorkshopCreator {
  accountId: string;
  displayName: string;
}

/**
 * customerRegistrationCode isn't a form field (see create-workshop.dto.ts's
 * comment) -- generated here instead. 10 hex characters is roughly
 * 1-in-a-trillion odds of colliding with an existing one; createWorkshop
 * retries a couple of times on that specific conflict rather than treating
 * "astronomically unlikely" as "impossible."
 */
function generateRegistrationCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

const TENANT_STAFF_ROLES: readonly StaffRole[] = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "BRANCH_MANAGER",
  "TECHNICIAN",
  "INVENTORY_MANAGER",
  "TEAM_LEADER",
  "DATA_ANALYST",
];

/*
 * The starter-template module lists that used to decide `enabledModules`
 * are gone. They were a proxy for a workshop's shape written before the
 * shape could be stated at creation, and keeping them meant two sources
 * of truth that could -- and did -- disagree: a workshop with pricing on
 * and a MINIMAL template got a live FINANCE_CORE capability and no
 * FINANCE module, so every finance permission was denied by
 * `ModuleEnabledLayer` with "this module is not enabled for your
 * workshop".
 *
 * `modulesForProfile` in @mop/shared derives the list from the capability
 * profile instead. `starterBuilderTemplate` is still accepted and stored
 * as Builder Control's own starting theme/layout choice -- it just no
 * longer decides which modules exist.
 */

export interface ProvisioningStep {
  readonly key:
    | "TENANT"
    | "CONFIGURATION"
    | "CAPABILITIES"
    | "POLICIES"
    | "FINANCE"
    | "OWNER"
    | "PERMISSIONS"
    | "RESPONSIBILITY"
    | "STRUCTURE"
    | "SERVICES"
    | "SPECIALIZATION"
    | "VERSION"
    | "AUDIT";
  readonly label: string;
  /** How many rows this step really wrote. Zero is reported, not hidden. */
  readonly count: number;
  /** What it did, in the same plain words the rest of this surface uses. */
  readonly detail: string;
}

export interface CreateWorkshopResult {
  tenant: Tenant;
  /** What the transaction actually did, in the order it did it. */
  steps: ProvisioningStep[];
  /**
   * The raw invite link, valid once. Real email delivery doesn't exist
   * yet (same honestly-labeled gap as the WhatsApp decision-link flow --
   * see technician.md's Ask Customer Panel), so the caller surfaces this
   * directly instead of pretending an email was sent. Never persisted or
   * retrievable again after this response.
   */
  inviteLink: string;
  demoDataEnqueued: boolean;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly specialization: SpecializationService,
  ) {}

  /**
   * Creates a new tenant plus its first owner in one transaction -- a
   * tenant that exists without an owner (or vice versa) would be a real,
   * unrecoverable-by-normal-means inconsistency, so both must succeed or
   * neither does.
   */
  async createWorkshop(dto: CreateWorkshopDto, creator: WorkshopCreator): Promise<CreateWorkshopResult> {
    // Global email uniqueness is deliberately an application-level check
    // here, not a schema-wide unique constraint: Account.email stays
    // unique per-tenant (@@unique([tenantId, email])), which is a real,
    // separately-justified design (the same person can legitimately hold
    // staff accounts at more than one tenant -- see AuthService's
    // MultipleAccountsError). This check only blocks *creating a brand
    // new* owner with an email that's already registered anywhere, which
    // is what the spec actually asks for ("Platform accounts and this new
    // owner account share the same email space at signup time") without
    // narrowing the platform's broader multi-tenant email model.
    const existingAccount = await this.prisma.account.findFirst({ where: { email: dto.ownerEmail } });
    if (existingAccount) {
      throw new ConflictException({
        code: "email_already_registered",
        message: "This email is already associated with an account.",
        details: { field: "ownerEmail" },
      });
    }

    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: dto.planId } });
    this.assertWithinPlanLimits(dto, plan);

    // The same function the browser previewed this draft with, run again
    // here against the plan's real ceilings. A client-side check the
    // server does not repeat is a suggestion; this is the enforcement,
    // and because it is literally the same code, the two can never
    // disagree about what is wrong.
    this.assertDraftIsPublishable(dto, plan);

    const rawInviteToken = randomBytes(32).toString("hex");

    // Only retry a generated-registration-code collision (see
    // generateRegistrationCode's doc comment) -- any other conflict
    // (name/slug, both real form fields) propagates immediately as an
    // ordinary user-facing error, since no amount of retrying fixes a
    // value the user themselves chose and needs to change.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { tenant, steps } = await this.attemptCreateWorkshop(dto, creator, rawInviteToken);
        return {
          tenant,
          steps,
          inviteLink: `/invite/accept?token=${rawInviteToken}`,
          demoDataEnqueued: dto.enableDemoData === true,
        };
      } catch (error) {
        const isRegistrationCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          this.uniqueTarget(error).includes("customerRegistrationCode");
        if (!isRegistrationCodeCollision || attempt === 3) {
          throw this.translateUniquenessError(error);
        }
      }
    }
    // Unreachable (the loop always returns or throws), needed only so
    // TypeScript sees every path returns a value.
    throw new Error("unreachable");
  }

  private async attemptCreateWorkshop(
    dto: CreateWorkshopDto,
    creator: WorkshopCreator,
    rawInviteToken: string,
  ): Promise<{ tenant: Tenant; steps: ProvisioningStep[] }> {
    return this.prisma.$transaction(async (tx) => {
      const steps: ProvisioningStep[] = [];
        const tenant = await tx.tenant.create({
          data: {
            name: dto.name,
            nameNormalized: dto.name.toLowerCase(),
            slug: dto.slug,
            customerRegistrationCode: generateRegistrationCode(),
            status: dto.initialStatus,
            planId: dto.planId,
            country: dto.country,
            city: dto.city,
            businessType: dto.businessType === "Other" ? (dto.businessTypeOther ?? "Other") : dto.businessType,
            primaryCategory: dto.primaryCategory,
            currency: dto.currency,
            timezone: dto.timezone,
          },
        });
        steps.push({
          key: "TENANT",
          label: "Registering the workshop",
          count: 1,
          detail: `${tenant.name} at /w/${tenant.slug}, trading in ${tenant.currency}.`,
        });

        await tx.tenantConfiguration.create({
          data: {
            tenantId: tenant.id,
            theme: {},
            pageLayouts: {},
            roleExperience: {},
            workflowPolicy: {},
            featureFlags: {},
            enabledModules: [...modulesForProfile((dto.capabilities ?? {}) as CapabilityProfile)],
            enabledFeatures: [],
            forms: {},
            messageTemplates: {},
          },
        });
        const enabledModules = modulesForProfile((dto.capabilities ?? {}) as CapabilityProfile);
        steps.push({
          key: "CONFIGURATION",
          label: "Preparing the workspace",
          count: enabledModules.length,
          detail: `${enabledModules.join(", ")} — derived from the capabilities above, so the two can never disagree.`,
        });

        // The capability profile, before anything that depends on the
        // workshop's shape. A row is written only for a deviation from
        // the full product -- the engine reads an absent row as ENABLED,
        // and writing twelve "ENABLED" rows would make an untouched
        // workshop look configured when it is simply complete.
        const capabilityRows = this.capabilityRowsFor(dto);
        if (capabilityRows.length > 0) {
          await tx.tenantCapability.createMany({
            data: capabilityRows.map((row) => ({
              tenantId: tenant.id,
              capabilityKey: row.key,
              status: row.status,
              source: "PLATFORM" as const,
              configuredBy: creator.accountId,
              reason: "Set at workshop creation.",
            })),
          });
        }
        steps.push({
          key: "CAPABILITIES",
          label: "Shaping the operation",
          count: capabilityRows.length,
          detail:
            capabilityRows.length === 0
              ? "Every capability left on — this workshop runs the full product."
              : capabilityRows.map((row) => `${row.key} ${row.status.toLowerCase()}`).join(", ") + ".",
        });

        // Policies second: their relevance is derived from the profile
        // above, so writing them first would mean writing answers to
        // questions this workshop's shape had not yet decided to ask.
        const policyRows = this.policyRowsFor(dto);
        if (policyRows.length > 0) {
          await tx.workshopPolicy.createMany({
            data: policyRows.map((row) => ({
              tenantId: tenant.id,
              policyKey: row.key,
              value: row.value,
              source: "PLATFORM" as const,
              configuredBy: creator.accountId,
              reason: "Answered at workshop creation.",
            })),
          });
        }
        steps.push({
          key: "POLICIES",
          label: "Setting the rules",
          count: policyRows.length,
          detail:
            policyRows.length === 0
              ? "Every policy left on its recommended answer."
              : `${policyRows.length} policy answer(s) recorded; the rest run on their recommended answer.`,
        });

        // FinanceConfiguration is where two policies become behaviour
        // rather than a stored string: the delivery gate reads
        // allowUnpaidDelivery, and recordPayment reads the partial-payment
        // rule. Written whenever the workshop prices anything at all, so
        // the gate has a row to read instead of falling through to a
        // default nobody chose.
        const financeWritten = await this.writeFinanceConfiguration(tx, tenant.id, dto);
        steps.push({
          key: "FINANCE",
          label: "Applying the money rules",
          count: financeWritten ? 1 : 0,
          detail: financeWritten
            ? this.financeDetail(dto)
            : "Money is handled outside MOP for this workshop, so there is nothing to configure here.",
        });

        const ownerAccount = await tx.account.create({
          data: {
            accountType: "TENANT_STAFF",
            tenantId: tenant.id,
            email: dto.ownerEmail,
            phone: dto.ownerPhone,
            passwordHash: null,
            status: "INVITED",
            inviteTokenHash: sha256(rawInviteToken),
            inviteTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

        await tx.staffUser.create({
          data: {
            accountId: ownerAccount.id,
            tenantId: tenant.id,
            fullName: dto.ownerFullName,
            role: "TENANT_OWNER",
            branchScope: [],
            warehouseScope: [],
            categoryScope: [dto.primaryCategory],
          },
        });
        steps.push({
          key: "OWNER",
          label: "Creating the owner",
          count: 1,
          detail: `${dto.ownerFullName} invited at ${dto.ownerEmail}. No password is set here — they choose their own.`,
        });

        const permissionCounts = await this.seedBaselineRolePermissionsAndPages(tx, tenant.id);
        steps.push({
          key: "PERMISSIONS",
          label: "Preparing the roles",
          count: permissionCounts.permissions,
          detail: `${permissionCounts.permissions} permission(s) and ${permissionCounts.pages} page grant(s) across ${permissionCounts.roles} roles.`,
        });

        // The permission rows that stop an enabled capability being one
        // nobody in the building can operate. See
        // grantsForResponsibilities' own doc: TENANT_OWNER holds no
        // inventory.* key in the baseline map, so a workshop with stock
        // and no storekeeper could not approve its first part request.
        const grants = grantsForResponsibilities(
          (dto.capabilities ?? {}) as CapabilityProfile,
          (dto.responsibilities ?? {}) as Record<string, never>,
        );
        if (grants.length > 0) {
          // Overwrite rather than insert: the baseline seeding above may
          // already have written a `false` row for this (role, key) pair,
          // and a second insert would violate the model's own uniqueness.
          for (const grant of grants) {
            await tx.rolePermission.upsert({
              where: { tenantId_role_permissionKey: { tenantId: tenant.id, role: grant.role, permissionKey: grant.permissionKey } },
              update: { allowed: grant.allowed },
              create: { tenantId: tenant.id, role: grant.role, permissionKey: grant.permissionKey, allowed: grant.allowed },
            });
          }
        }
        steps.push({
          key: "RESPONSIBILITY",
          label: "Assigning responsibility",
          count: grants.length,
          detail:
            grants.length === 0
              ? "Every capability is operated by the role that normally holds it."
              : this.responsibilityDetail(dto, grants.length),
        });

        const structure = await this.seedStructure(tx, tenant.id, dto);
        steps.push({
          key: "STRUCTURE",
          label: "Building the structure",
          count: structure.branches + structure.warehouses,
          detail: `${structure.branches} branch(es), ${structure.warehouses} store(s), ${structure.grants} branch-to-store grant(s).`,
        });

        const specializationNames = await this.seedStarterSpecializations(tx, tenant.id, dto);
        steps.push({
          key: "SPECIALIZATION",
          label: "Authoring the cards",
          count: specializationNames.length,
          detail:
            specializationNames.length === 0
              ? "No starter cards — the owner authors their own in Forms & Fields."
              : specializationNames.join(", ") + ".",
        });

        const services = dto.services ?? [];
        if (services.length > 0) {
          await tx.priceCatalogEntry.createMany({
            data: services.map((service) => ({
              tenantId: tenant.id,
              itemKey: service.name,
              itemType: service.category?.trim() ? service.category.trim().toUpperCase() : "SERVICE",
              // Decimal, from a string of minor units. Never parsed as a
              // JS number on the way in -- Prisma takes the string and
              // the database stores the exact value.
              unitPrice: new Prisma.Decimal(service.price).dividedBy(100),
              isActive: true,
            })),
          });
        }
        steps.push({
          key: "SERVICES",
          label: "Pricing the work",
          count: services.length,
          detail:
            services.length === 0
              ? "No catalogue prices — staff price each job as they go."
              : `${services.length} service(s) priced. The running invoice reads these from the first job onward.`,
        });

        // The published configuration, snapshotted. A workshop's shape at
        // creation is exactly the kind of thing someone asks about a year
        // later ("was inventory on when this job was taken in?"), and the
        // time-ranged capability rows answer that only from this point
        // forward -- the snapshot records what was decided, and by whom,
        // in one readable object.
        await tx.tenantConfigurationVersion.create({
          data: {
            tenantId: tenant.id,
            version: 1,
            snapshot: this.configurationSnapshot(dto) as unknown as Prisma.InputJsonValue,
            riskLevel: "HIGH",
            publishedById: creator.accountId,
          },
        });
        steps.push({
          key: "VERSION",
          label: "Recording the configuration",
          count: 1,
          detail: "Version 1 snapshotted, so what was decided today stays readable after any later change.",
        });

        await this.auditService.record(
          {
            tenantId: tenant.id,
            actorId: creator.accountId,
            actorType: "PLATFORM",
            actorName: creator.displayName,
            targetType: "Tenant",
            targetId: tenant.id,
            action: "platform.workshop.created",
            after: {
              name: tenant.name,
              slug: tenant.slug,
              planId: tenant.planId,
              initialStatus: dto.initialStatus,
              // The shape, not just the row. An audit entry saying only
              // "a workshop was created" cannot answer the question
              // anyone actually asks of it later, which is what shape it
              // was created in.
              capabilities: this.capabilityRowsFor(dto).map((row) => `${row.key}=${row.status}`),
              policies: this.policyRowsFor(dto).map((row) => `${row.key}=${row.value}`),
              branches: (dto.branches ?? []).map((branch) => branch.code),
              warehouses: (dto.warehouses ?? []).map((warehouse) => warehouse.code),
              specializationPacks: dto.specializationPacks ?? [],
              responsibilities: dto.responsibilities ?? {},
              services: (dto.services ?? []).map((service) => service.name),
            },
            riskLevel: "HIGH",
          },
          tx,
        );
        steps.push({
          key: "AUDIT",
          label: "Signing the record",
          count: 1,
          detail: `Recorded against ${creator.displayName}, at high risk level, with the full configuration attached.`,
        });

      return { tenant, steps };
    });
  }

  /** Populates the Plan dropdown on Add Workshop Owner -- real data, not a hardcoded option list. */
  async listPlans() {
    return this.prisma.plan.findMany({
      select: { id: true, code: true, name: true, maxBranches: true, maxUsers: true, maxWarehouses: true, monthlyPrice: true },
      orderBy: { name: "asc" },
    });
  }

  async isNameAvailable(name: string): Promise<boolean> {
    const existing = await this.prisma.tenant.findUnique({ where: { nameNormalized: name.toLowerCase() } });
    return !existing;
  }

  async isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    return !existing;
  }

  async isOwnerEmailAvailable(email: string): Promise<boolean> {
    const existing = await this.prisma.account.findFirst({ where: { email } });
    return !existing;
  }

  private assertWithinPlanLimits(
    dto: CreateWorkshopDto,
    plan: { maxBranches: number; maxUsers: number; maxWarehouses: number },
  ): void {
    if (dto.allowedBranchesStart > plan.maxBranches) {
      throw new ConflictException({
        code: "exceeds_plan_limit",
        message: `Selected plan does not allow more than ${plan.maxBranches} branch(es).`,
        details: { field: "allowedBranchesStart" },
      });
    }
    if (dto.allowedUsersStart > plan.maxUsers) {
      throw new ConflictException({
        code: "exceeds_plan_limit",
        message: `Selected plan does not allow more than ${plan.maxUsers} user(s).`,
        details: { field: "allowedUsersStart" },
      });
    }
    if (dto.allowedWarehousesStart > plan.maxWarehouses) {
      throw new ConflictException({
        code: "exceeds_plan_limit",
        message: `Selected plan does not allow more than ${plan.maxWarehouses} warehouse(s).`,
        details: { field: "allowedWarehousesStart" },
      });
    }
  }

  /**
   * RolePermission + RolePage baseline, per Add Workshop Owner's spec:
   * "not just the Owner's, every role gets its baseline."
   *
   * Every role is seeded regardless of which capabilities are on. That is
   * deliberate and matches the permission resolver's own layering: the
   * capability layer sits ABOVE role permission, so a role whose
   * capability is off is already fully blocked at runtime, and seeding it
   * anyway means re-enabling that capability later is a capability change
   * rather than a permission backfill nobody remembers to run.
   *
   * Returns what it wrote, so the publish screen reports a real number
   * instead of a reassuring one.
   */
  private async seedBaselineRolePermissionsAndPages(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<{ roles: number; permissions: number; pages: number }> {
    const permissionRows: { tenantId: string; role: StaffRole; permissionKey: string; allowed: boolean }[] = [];
    const pageRows: { tenantId: string; role: StaffRole; pageId: string; allowed: boolean }[] = [];

    for (const role of TENANT_STAFF_ROLES) {
      for (const [permissionKey, allowed] of Object.entries(DEFAULT_ROLE_PERMISSIONS[role] ?? {})) {
        permissionRows.push({ tenantId, role, permissionKey, allowed: allowed! });
      }
      for (const pageId of ROLE_PAGES[role] ?? []) {
        pageRows.push({ tenantId, role, pageId, allowed: true });
      }
    }

    // Two statements rather than several hundred. This runs inside the
    // creation transaction, which holds row locks for its whole duration
    // -- and a per-row loop over ~7 roles of permissions was the single
    // longest thing that transaction did.
    await tx.rolePermission.createMany({ data: permissionRows });
    await tx.rolePage.createMany({ data: pageRows });

    return { roles: TENANT_STAFF_ROLES.length, permissions: permissionRows.length, pages: pageRows.length };
  }

  /**
   * The workshop's real branches and stores.
   *
   * PHASE_17.md 17.B, and the gap scenario 6 recorded: a 4-branch
   * onboarding was done partly through SQL because creation could not
   * express structure. A workshop that declares none still gets one
   * branch, because a work order is taken in AT a branch and a tenant
   * with zero branches cannot accept its first job -- the draft validator
   * refuses that case, and this is the belt to its braces.
   */
  private async seedStructure(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateWorkshopDto,
  ): Promise<{ branches: number; warehouses: number; grants: number }> {
    // A workshop with no branch cannot take in a single job --
    // `WorkOrder.branchId` is required -- so one is always created. The
    // fallback is derived from the workshop's own name rather than
    // called "Default", which is what the owner would have to rename on
    // day one.
    const branches =
      dto.branches && dto.branches.length > 0
        ? dto.branches
        : [{ name: dto.name, code: "MAIN", city: dto.city, address: undefined }];

    const branchIdByCode = new Map<string, string>();
    for (const branch of branches) {
      const created = await tx.branch.create({
        data: {
          tenantId,
          name: branch.name,
          code: branch.code,
          city: branch.city ?? dto.city,
          address: branch.address ?? null,
        },
      });
      branchIdByCode.set(branch.code, created.id);
    }

    const warehouses = dto.warehouses ?? [];
    let grants = 0;
    for (const warehouse of warehouses) {
      const created = await tx.warehouse.create({
        data: { tenantId, name: warehouse.name, code: warehouse.code },
      });

      // An empty branch list means "every branch", which is the right
      // reading for a single-store workshop: the alternative -- granting
      // it to nothing -- would create a store no branch may draw from,
      // which is the same trap as no store at all.
      const targetCodes = warehouse.branchCodes.length > 0 ? warehouse.branchCodes : [...branchIdByCode.keys()];
      for (const code of targetCodes) {
        const branchId = branchIdByCode.get(code);
        if (!branchId) continue;
        await tx.branchWarehouseAccess.create({ data: { tenantId, branchId, warehouseId: created.id } });
        grants += 1;
      }
    }

    return { branches: branches.length, warehouses: warehouses.length, grants };
  }

  /**
   * The starter service cards and measurement forms this workshop begins
   * with.
   *
   * Phase 17.A shipped this as an if-chain over two hardcoded profiles.
   * The packs are data now (`SPECIALIZATION_PACKS` in @mop/shared), which
   * is what lets the onboarding screen list the exact cards a choice will
   * create -- a promise it can only make honestly if this loop is the
   * thing that fulfils it, reading the same list.
   *
   * The two original profile keys still work: a caller that sends
   * `starterSpecializationProfile: "QUICK_SERVICE"` gets the QUICK_SERVICE
   * pack, because the pack keys were chosen to match. `NONE` seeds
   * nothing, as before.
   */
  private async seedStarterSpecializations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateWorkshopDto,
  ): Promise<string[]> {
    const packKeys = new Set(dto.specializationPacks ?? []);
    const legacyProfile = dto.starterSpecializationProfile;
    if (legacyProfile && legacyProfile !== "NONE" && specializationPack(legacyProfile)) {
      packKeys.add(legacyProfile);
    }
    if (packKeys.size === 0) return [];

    const definitions = definitionsSeededBy([...packKeys]);
    for (const definition of definitions) {
      await this.specialization.defineCard(
        tenantId,
        dto.primaryCategory,
        definition.kind,
        definition.name,
        definition.fields,
        tx,
      );
    }

    return definitions.map((definition) => definition.name);
  }

  // -------------------------------------------------------------------
  // Turning a submitted draft into rows
  // -------------------------------------------------------------------

  /**
   * The capability rows to write: deviations only.
   *
   * An ENABLED entry is dropped rather than stored, because the engine
   * reads an absent row as ENABLED and a stored ENABLED row means the
   * same thing while looking like a decision someone made. Keeping the
   * table to real deviations is also what makes `lockedCapabilities` and
   * the workshops list readable at a glance.
   */
  private capabilityRowsFor(dto: CreateWorkshopDto): { key: CapabilityKey; status: CapabilityStatus }[] {
    const rows: { key: CapabilityKey; status: CapabilityStatus }[] = [];
    for (const [key, status] of Object.entries(dto.capabilities ?? {})) {
      if (!KNOWN_CAPABILITY_KEYS.has(key) || !KNOWN_CAPABILITY_STATUSES.has(status as string)) continue;
      if (status === "ENABLED") continue;
      rows.push({ key: key as CapabilityKey, status: status as CapabilityStatus });
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * The policy rows to write: answers that differ from the registry's
   * declared default.
   *
   * Same reasoning as capabilities. An absent `WorkshopPolicy` row means
   * "the registry default applies", which is a real, reasoned answer with
   * a written justification behind it -- storing it would turn every
   * workshop's policy table into fourteen rows of noise and make the two
   * or three answers that ARE this workshop's own impossible to find.
   */
  private policyRowsFor(dto: CreateWorkshopDto): { key: string; value: string }[] {
    const rows: { key: string; value: string }[] = [];
    for (const [key, value] of Object.entries(dto.policies ?? {})) {
      const definition = policyDefinition(key);
      if (!definition) continue;
      if (!definition.options.some((option) => option.key === value)) continue;
      if (value === definition.default) continue;
      rows.push({ key, value });
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }

  /**
   * Where two policies stop being stored strings and start being
   * behaviour.
   *
   * `allowUnpaidDelivery` is read by the delivery gate
   * (`payment.settled_or_policy_allows`) and `FULL_ONLY` is read by
   * `recordPayment`. Writing this row is therefore not bookkeeping: it is
   * the moment the answer given on the Policies stage becomes the reason
   * a car does or does not leave the yard.
   *
   * Skipped entirely when the workshop does no pricing in MOP -- there is
   * no money configuration to hold for a workshop whose money is
   * elsewhere, and an unread row implying otherwise is worse than none.
   */
  private async writeFinanceConfiguration(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateWorkshopDto,
  ): Promise<boolean> {
    const profile = (dto.capabilities ?? {}) as CapabilityProfile;
    if (profile.FINANCE_CORE === "DISABLED") return false;

    const deliveryRule = this.effectivePolicy(dto, "DELIVERY_BLOCKED_UNTIL_PAID");
    const partialRule = this.effectivePolicy(dto, "PARTIAL_PAYMENT");
    const invoiceVisibilityRule = this.effectivePolicy(dto, "CUSTOMER_INVOICE_VISIBILITY");

    await tx.financeConfiguration.create({
      data: {
        tenantId,
        externalBillingEnabled: profile.BILLING === "EXTERNAL" || profile.BILLING === "DISABLED",
        // NEVER means the gate must not hold a car for an outstanding
        // balance. ALWAYS and REQUIRES_OVERRIDE both block today -- the
        // audited release action REQUIRES_OVERRIDE promises is Governance
        // Controls' work, and the policy's own enforcement note says so
        // rather than this column pretending the difference exists.
        allowUnpaidDelivery: deliveryRule === "NEVER",
        allowPartialPaidDelivery: deliveryRule === "NEVER" && partialRule === "ALLOWED",
        // Read by CustomerDecisionService.pricingVisible on every decision
        // request; before this the column only ever held its Prisma
        // default, whatever the workshop actually answered.
        customerInvoiceVisible: invoiceVisibilityRule !== "HIDDEN",
      },
    });
    return true;
  }

  /** Which capabilities were handed to a role other than the one that normally holds them. */
  private responsibilityDetail(dto: CreateWorkshopDto, grantCount: number): string {
    const delegated = Object.entries(dto.responsibilities ?? {})
      .filter(([, answer]) => answer !== "DEDICATED")
      .map(([capability, answer]) => `${capability} to ${String(answer).toLowerCase().replace(/_/g, " ")}`);
    return `${grantCount} permission(s) granted: ${delegated.join(", ")}.`;
  }

  private financeDetail(dto: CreateWorkshopDto): string {
    const deliveryRule = this.effectivePolicy(dto, "DELIVERY_BLOCKED_UNTIL_PAID");
    return deliveryRule === "NEVER"
      ? "A vehicle may be handed back with a balance outstanding; the balance is chased separately."
      : "The delivery gate will hold a vehicle until its balance is settled.";
  }

  /** A policy's value for this draft: the submitted answer, or the registry's declared default. */
  private effectivePolicy(dto: CreateWorkshopDto, policyKey: string): string | null {
    const submitted = (dto.policies ?? {})[policyKey];
    const definition = policyDefinition(policyKey);
    if (!definition) return null;
    return definition.options.some((option) => option.key === submitted) ? submitted : definition.default;
  }

  /** What was decided, as one readable object, for `TenantConfigurationVersion.snapshot`. */
  private configurationSnapshot(dto: CreateWorkshopDto) {
    return {
      createdVia: "onboarding",
      starterBuilderTemplate: dto.starterBuilderTemplate,
      capabilities: Object.fromEntries(this.capabilityRowsFor(dto).map((row) => [row.key, row.status])),
      policies: Object.fromEntries(this.policyRowsFor(dto).map((row) => [row.key, row.value])),
      specializationPacks: dto.specializationPacks ?? [],
      responsibilities: dto.responsibilities ?? {},
      services: (dto.services ?? []).map((service) => ({ name: service.name, price: service.price })),
      branches: (dto.branches ?? []).map((branch) => ({ code: branch.code, name: branch.name })),
      warehouses: (dto.warehouses ?? []).map((warehouse) => ({
        code: warehouse.code,
        name: warehouse.name,
        branchCodes: warehouse.branchCodes,
      })),
      softTargets: {
        branches: dto.allowedBranchesStart,
        users: dto.allowedUsersStart,
        warehouses: dto.allowedWarehousesStart,
      },
    };
  }

  /**
   * Refuses a draft that would produce a broken workshop, using the same
   * validator the browser previews with.
   *
   * Only BLOCKERs refuse. A warning ("this workshop starts with no
   * service cards") is a real, valid shape someone chose, and refusing it
   * would make the platform's opinion outrank the operator's.
   */
  private assertDraftIsPublishable(
    dto: CreateWorkshopDto,
    plan: { maxBranches: number; maxUsers: number; maxWarehouses: number },
  ): void {
    const result = validateDraft(draftFromDto(dto), {
      maxBranches: plan.maxBranches,
      maxUsers: plan.maxUsers,
      maxWarehouses: plan.maxWarehouses,
    });
    const blockers = result.findings.filter((finding) => finding.severity === "BLOCKER");
    if (blockers.length === 0) return;

    throw new BadRequestException({
      code: "configuration_invalid",
      message: blockers[0].message,
      details: {
        findings: blockers.map((finding) => ({
          code: finding.code,
          stage: finding.stage,
          message: finding.message,
          subject: finding.subject,
        })),
      },
    });
  }

  private uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
    return Array.isArray(error.meta?.target) ? (error.meta!.target as string[]).join(",") : "";
  }

  private translateUniquenessError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = this.uniqueTarget(error);
      if (target.includes("nameNormalized")) {
        return new ConflictException({
          code: "name_already_taken",
          message: "A workshop with this name already exists.",
          details: { field: "name" },
        });
      }
      if (target.includes("slug")) {
        return new ConflictException({
          code: "slug_already_taken",
          message: "This URL slug is already in use.",
          details: { field: "slug" },
        });
      }
      if (target.includes("customerRegistrationCode")) {
        // Not a form field the user filled in (see generateRegistrationCode's
        // doc comment) -- if all retries in createWorkshop are exhausted,
        // there's nothing field-specific to tell them, per the spec's
        // general "Server/transaction failure" error state.
        return new ConflictException({
          code: "workshop_creation_failed",
          message: "Something went wrong creating this workshop. Nothing was saved -- you can try again.",
        });
      }
    }
    return error;
  }
}
