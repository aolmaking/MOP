import { ConflictException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { Prisma, type Tenant } from "@mop/database";
import { DEFAULT_ROLE_PERMISSIONS, ROLE_PAGES } from "@mop/shared";
import type { StaffRole } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { sha256 } from "../auth/token.util";
import { SpecializationService } from "../specialization/specialization.service";
import type { CreateWorkshopDto } from "./create-workshop.dto";

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

// A real, working baseline per starter template -- simple on purpose.
// Builder Control (Phase 2 step 6) is what eventually gives Super Admin a
// full theme/layout/role-experience editor per template; until then, the
// one real thing a template controls is which modules a new workshop
// starts with, which is honest and non-fake even though it's simple.
const STARTER_TEMPLATE_MODULES: Record<string, string[]> = {
  DEFAULT: ["ORGANIZATION", "OPERATIONS", "FINANCE", "INVENTORY", "REPORTS", "AUDIT", "CUSTOMER_PORTAL"],
  MINIMAL: ["ORGANIZATION", "OPERATIONS", "AUDIT"],
  HIGH_VOLUME_BRANCH_NETWORK: [
    "ORGANIZATION",
    "OPERATIONS",
    "FINANCE",
    "INVENTORY",
    "TEAM_MANAGEMENT",
    "REPORTS",
    "AUDIT",
    "CUSTOMER_PORTAL",
  ],
};

export interface CreateWorkshopResult {
  tenant: Tenant;
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

    const rawInviteToken = randomBytes(32).toString("hex");

    // Only retry a generated-registration-code collision (see
    // generateRegistrationCode's doc comment) -- any other conflict
    // (name/slug, both real form fields) propagates immediately as an
    // ordinary user-facing error, since no amount of retrying fixes a
    // value the user themselves chose and needs to change.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const tenant = await this.attemptCreateWorkshop(dto, creator, rawInviteToken);
        return { tenant, inviteLink: `/invite/accept?token=${rawInviteToken}`, demoDataEnqueued: dto.enableDemoData === true };
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

  private async attemptCreateWorkshop(dto: CreateWorkshopDto, creator: WorkshopCreator, rawInviteToken: string): Promise<Tenant> {
    return this.prisma.$transaction(async (tx) => {
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

        await tx.tenantConfiguration.create({
          data: {
            tenantId: tenant.id,
            theme: {},
            pageLayouts: {},
            roleExperience: {},
            workflowPolicy: {},
            featureFlags: {},
            enabledModules: STARTER_TEMPLATE_MODULES[dto.starterBuilderTemplate] ?? [],
            enabledFeatures: [],
            forms: {},
            messageTemplates: {},
          },
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

        await this.seedBaselineRolePermissionsAndPages(tx, tenant.id);
        await this.seedStarterSpecializations(tx, tenant.id, dto);

        await this.auditService.record(
          {
            tenantId: tenant.id,
            actorId: creator.accountId,
            actorType: "PLATFORM",
            actorName: creator.displayName,
            targetType: "Tenant",
            targetId: tenant.id,
            action: "platform.workshop.created",
            after: { name: tenant.name, slug: tenant.slug, planId: tenant.planId, initialStatus: dto.initialStatus },
            riskLevel: "HIGH",
          },
          tx,
        );

      return tenant;
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

  /** RolePermission + RolePage baseline, per Add Workshop Owner's spec: "not just the Owner's, every role gets its baseline." */
  private async seedBaselineRolePermissionsAndPages(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    for (const role of TENANT_STAFF_ROLES) {
      const permissions = DEFAULT_ROLE_PERMISSIONS[role] ?? {};
      for (const [permissionKey, allowed] of Object.entries(permissions)) {
        await tx.rolePermission.create({ data: { tenantId, role, permissionKey, allowed: allowed! } });
      }

      const pages = ROLE_PAGES[role] ?? [];
      for (const pageId of pages) {
        await tx.rolePage.create({ data: { tenantId, role, pageId, allowed: true } });
      }
    }
  }

  /**
   * Phase 17.A -- a small number of starter profiles, not one giant form.
   * `starterSpecializationProfile` is optional and defaults to seeding
   * nothing, matching a workshop (like El-Makkawy's dealership shape)
   * that needs no starter specialization data at all. The two named
   * profiles seed exactly the cases docs/phases/PHASE_15.md already
   * proved end-to-end -- Nafath's oil-change service card, Delta's
   * hydraulic diagnostic form -- so a super admin creating a workshop
   * matching either shape gets real, usable data from the moment the
   * owner first logs in, not an empty specialization library.
   */
  private async seedStarterSpecializations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateWorkshopDto,
  ): Promise<void> {
    const profile = dto.starterSpecializationProfile ?? "NONE";
    if (profile === "NONE") return;

    if (profile === "QUICK_SERVICE") {
      await this.specialization.defineCard(
        tenantId,
        dto.primaryCategory,
        "SERVICE_CARD",
        "Oil Change",
        [
          { key: "viscosity", label: "Viscosity", type: "ENUM", enumOptions: ["5W-30", "5W-40", "10W-40"], required: true },
          { key: "litres", label: "Litres", type: "DECIMAL", unit: "L", required: true },
          { key: "filterType", label: "Filter type", type: "TEXT" },
        ],
        tx,
      );
    }

    if (profile === "FIELD_SERVICE") {
      await this.specialization.defineCard(
        tenantId,
        dto.primaryCategory,
        "MEASUREMENT_FORM",
        "Hydraulic Pressure Diagnostic",
        [
          { key: "main_pump", label: "Main pump", type: "DECIMAL", unit: "bar", required: true },
          { key: "return_line", label: "Return line", type: "DECIMAL", unit: "bar", required: true },
          { key: "within_spec", label: "Within spec", type: "BOOLEAN", required: true },
        ],
        tx,
      );
    }
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
