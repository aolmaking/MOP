import { createHash, randomBytes, scryptSync } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountStatus, AccountType, AuditActorType, CategoryCode as PrismaCategoryCode, StaffStatus } from "@prisma/client";
import type { CategoryCode, CreateStaffUserDto, StaffUserDto } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const ALLOWED_STAFF_ROLES = new Set([
  "tenant_admin",
  "branch_manager",
  "technician",
  "inventory_manager",
  "team_leader",
  "data_analyst"
]);

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async staffUsers(session: RequestSessionContext): Promise<StaffUserDto[]> {
    const tenantId = this.tenantId(session);
    const users = await this.prisma.staffUser.findMany({
      where: { tenantId },
      orderBy: { name: "asc" }
    });
    return users.map((user) => this.staffDto(user));
  }

  async creationOptions(session: RequestSessionContext) {
    const tenantId = this.tenantId(session);
    const [tenant, branches, warehouses, templates, technicians] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { customerRegistrationCode: true, customerRegistrationEnabled: true } }),
      this.prisma.branch.findMany({ where: { tenantId, status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.warehouse.findMany({ where: { tenantId, status: "active" }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } }),
      this.prisma.permissionTemplate.findMany({ where: { tenantId }, select: { id: true, code: true, label: true }, orderBy: { label: "asc" } }),
      this.prisma.staffUser.findMany({ where: { tenantId, role: "technician", status: StaffStatus.ACTIVE }, select: { id: true, name: true, branchScope: true }, orderBy: { name: "asc" } })
    ]);
    return {
      customerRegistration: tenant,
      roles: [...ALLOWED_STAFF_ROLES],
      categories: ["Cars", "Motorcycles", "Heavy Equipment"],
      branches,
      warehouses,
      templates,
      technicians
    };
  }

  async createStaffUser(session: RequestSessionContext, input: CreateStaffUserDto) {
    const tenantId = this.tenantId(session);
    if (!["tenant_owner", "tenant_admin"].includes(session.roleId)) {
      throw new BadRequestException("Only Tenant Owner or Tenant Admin can create staff accounts.");
    }
    const role = String(input.role || "");
    if (!ALLOWED_STAFF_ROLES.has(role)) throw new BadRequestException("Unsupported tenant staff role.");
    const name = this.required(input.name, "Name", 120);
    const email = this.email(input.email);
    const branchScope = this.unique(input.branchScope);
    const warehouseScope = this.unique(input.warehouseScope);
    const categoryScope = this.categories(input.categoryScope || []);
    const teamScope = this.unique(input.teamScope);
    const managedTechnicianIds = this.unique(input.managedTechnicianIds);
    const status = input.status === "active" ? StaffStatus.ACTIVE : StaffStatus.INVITED;
    const inviteToken = status === StaffStatus.INVITED ? randomBytes(24).toString("hex") : undefined;
    if (status === StaffStatus.ACTIVE) this.assertPassword(input.password);
    this.validateRequiredScopes(role, { branchScope, warehouseScope, categoryScope, teamScope, managedTechnicianIds });

    const [duplicate, template, branches, warehouses, technicians, entitlements] = await Promise.all([
      this.prisma.account.findUnique({ where: { loginIdentifier: email } }),
      this.prisma.permissionTemplate.findFirst({ where: { id: input.permissionTemplateId, tenantId } }),
      this.prisma.branch.findMany({ where: { tenantId, id: { in: branchScope } }, select: { id: true } }),
      this.prisma.warehouse.findMany({ where: { tenantId, id: { in: warehouseScope } }, select: { id: true, branchId: true } }),
      this.prisma.staffUser.findMany({
        where: { tenantId, id: { in: managedTechnicianIds }, role: "technician", status: { not: StaffStatus.SUSPENDED } },
        select: { id: true, branchScope: true }
      }),
      this.prisma.controlSetting.findUnique({ where: { tenantId_key: { tenantId, key: "platform.entitlements" } }, select: { value: true } })
    ]);
    const entitlementValue = entitlements?.value as Record<string, unknown> | undefined;
    const maxUsers = entitlementValue ? Number(entitlementValue.usersAllowed || entitlementValue.usersAllowed || 0) : 0;
    const staffCount = maxUsers > 0
      ? await this.prisma.account.count({ where: { tenantId, accountType: AccountType.TENANT_STAFF } })
      : 0;
    if (maxUsers > 0 && staffCount >= maxUsers) {
      throw new BadRequestException("Workshop user limit has been reached. Contact Platform Super Admin to increase user entitlement.");
    }
    if (duplicate) throw new ConflictException("A staff account already exists for this email.");
    if (!template) throw new NotFoundException("Permission template was not found in this workshop.");
    if (branches.length !== branchScope.length) throw new BadRequestException("One or more branch scopes are outside this workshop.");
    if (warehouses.length !== warehouseScope.length) throw new BadRequestException("One or more warehouse scopes are outside this workshop.");
    if (technicians.length !== managedTechnicianIds.length) throw new BadRequestException("One or more managed technicians are invalid or outside this workshop.");
    if (role === "inventory_manager" && branchScope.length && warehouses.some((warehouse) => !branchScope.includes(warehouse.branchId))) {
      throw new BadRequestException("Inventory Manager warehouse scope must belong to an assigned branch.");
    }
    if (role === "team_leader" && branchScope.length && technicians.some((technician) => technician.branchScope.every((branchId) => !branchScope.includes(branchId)))) {
      throw new BadRequestException("Managed technicians must overlap the Team Leader branch scope.");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          tenantId,
          accountType: AccountType.TENANT_STAFF,
          loginIdentifier: email,
          passwordHash: input.password ? this.passwordHash(input.password) : null,
          inviteTokenHash: inviteToken ? createHash("sha256").update(inviteToken).digest("hex") : null,
          inviteExpiresAt: inviteToken ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
          invitedBy: session.userId,
          status: status === StaffStatus.ACTIVE ? AccountStatus.ACTIVE : AccountStatus.INVITED
        }
      });
      const user = await tx.staffUser.create({
        data: {
          tenantId,
          accountId: account.id,
          name,
          email,
          role,
          status,
          branchScope,
          warehouseScope,
          categoryScope,
          teamScope,
          managedTechnicianIds,
          permissionTemplateId: template.id
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: AuditActorType.TENANT_STAFF,
          actorId: session.userId,
          actorName: session.displayName,
          action: "organization.staff.created",
          targetType: "staff_user",
          targetId: user.id,
          reason: `Created ${role} through Organization & Access.`,
          after: {
            role,
            status: status.toLowerCase(),
            branchScope,
            warehouseScope,
            categoryScope,
            teamScope,
            managedTechnicianIds,
            permissionTemplateId: template.id
          }
        }
      });
      return user;
    });
    return {
      status: status.toLowerCase(),
      user: this.staffDto(row),
      invitation: inviteToken ? { inviteLink: `/invite/${inviteToken}`, expiresInDays: 7 } : undefined
    };
  }

  private validateRequiredScopes(role: string, scopes: {
    branchScope: string[];
    warehouseScope: string[];
    categoryScope: PrismaCategoryCode[];
    teamScope: string[];
    managedTechnicianIds: string[];
  }) {
    if (["branch_manager", "technician", "inventory_manager", "team_leader"].includes(role) && !scopes.branchScope.length) {
      throw new BadRequestException(`${this.roleLabel(role)} must have at least one branch scope.`);
    }
    if (role === "inventory_manager" && !scopes.warehouseScope.length) {
      throw new BadRequestException("Inventory Manager must have at least one warehouse scope.");
    }
    if (["technician", "inventory_manager"].includes(role) && !scopes.categoryScope.length) {
      throw new BadRequestException(`${this.roleLabel(role)} must have at least one category scope.`);
    }
    if (role === "team_leader" && !scopes.teamScope.length && !scopes.managedTechnicianIds.length) {
      throw new BadRequestException("Team Leader must have at least one team or managed technician scope.");
    }
  }

  private staffDto(user: any): StaffUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: this.roleLabel(user.role),
      status: user.status.toLowerCase(),
      branchScope: user.branchScope,
      warehouseScope: user.warehouseScope,
      categoryScope: user.categoryScope.map((code: string) => this.categoryLabel(code)),
      teamScope: user.teamScope || [],
      managedTechnicianIds: user.managedTechnicianIds || [],
      permissionTemplateId: user.permissionTemplateId || undefined
    };
  }

  private tenantId(session: RequestSessionContext) {
    if (!session.tenantId) throw new BadRequestException("Tenant scope is required.");
    return session.tenantId;
  }

  private categories(values: CategoryCode[]) {
    return [...new Set(values.map((value) => {
      if (value === "Motorcycles") return PrismaCategoryCode.MOTORCYCLES;
      if (value === "Heavy Equipment") return PrismaCategoryCode.HEAVY_EQUIPMENT;
      return PrismaCategoryCode.CARS;
    }))];
  }

  private categoryLabel(code: string): CategoryCode {
    if (code === "MOTORCYCLES") return "Motorcycles";
    if (code === "HEAVY_EQUIPMENT") return "Heavy Equipment";
    return "Cars";
  }

  private unique(values?: string[]) {
    return [...new Set((values || []).map(String).map((value) => value.trim()).filter(Boolean))];
  }

  private email(value: string) {
    const email = String(value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException("A valid staff email is required.");
    return email;
  }

  private required(value: unknown, label: string, max: number) {
    const text = String(value || "").trim();
    if (!text) throw new BadRequestException(`${label} is required.`);
    if (text.length > max) throw new BadRequestException(`${label} is too long.`);
    return text;
  }

  private assertPassword(password?: string) {
    if (!password || password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException("Active staff accounts require a strong password.");
    }
  }

  private passwordHash(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
  }

  private roleLabel(role: string) {
    return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
