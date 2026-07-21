import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { AccountStatus, AccountType, AuditActorType, PortalStatus, StaffStatus, TenantStatus } from "@prisma/client";
import { routeCatalog } from "@mop/shared";
import type {
  CategoryCode,
  CustomerRegistrationResultDto,
  LoginResponseDto,
  NavigationItemDto,
  SessionContextDto,
  WorkspaceDto
} from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import type { AcceptInvitationDto, CustomerRegisterDto, LoginDto } from "./dto";
import { EffectiveAccessResolverService, type EffectiveAccessResult } from "./effective-access-resolver.service";

const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const LEGACY_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "scrypt2$dummy-login-timing-salt$0".replace("$0", `$${scryptSync("dummy-password", "dummy-login-timing-salt", 64, SCRYPT_PARAMS).toString("hex")}`);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly effectiveAccess: EffectiveAccessResolverService
  ) {}

  async login(dto: LoginDto, meta: { userAgent?: string; ipAddress?: string } = {}): Promise<LoginResponseDto> {
    const identifier = String(dto.loginIdentifier || "").trim().toLowerCase();
    if (!identifier || !dto.password) throw new UnauthorizedException("Login identifier and password are required.");
    const account = await this.prisma.account.findFirst({
      where: { loginIdentifier: identifier },
      include: this.accountGraph()
    });
    if (!account || account.accountType === AccountType.SYSTEM_AUTOMATION || account.status !== AccountStatus.ACTIVE) {
      this.verifyPassword(dto.password, DUMMY_PASSWORD_HASH);
      await this.deniedLogin(account?.tenantId, account?.id, identifier, "invalid_or_inactive_account");
      throw new UnauthorizedException("Invalid credentials or inactive account.");
    }
    if (account.lockedUntil && account.lockedUntil > new Date()) {
      this.verifyPassword(dto.password, DUMMY_PASSWORD_HASH);
      await this.deniedLogin(account.tenantId, account.id, identifier, "account_temporarily_locked");
      throw new UnauthorizedException("Invalid credentials or inactive account.");
    }
    this.assertAccountAndTenantAccess(account);
    if (!account.passwordHash || !dto.password || !this.verifyPassword(dto.password, account.passwordHash)) {
      await this.recordFailedLogin(account);
      await this.deniedLogin(account.tenantId, account.id, identifier, "invalid_credentials");
      throw new UnauthorizedException("Invalid credentials or inactive account.");
    }
    return this.createSession(account, "Identity gateway login.", meta);
  }

  async registerCustomer(dto: CustomerRegisterDto): Promise<CustomerRegistrationResultDto> {
    const workshopCode = String(dto.workshopCode || "").trim();
    if (!workshopCode) {
      throw new BadRequestException("Please use the workshop registration link or enter a valid workshop code.");
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { customerRegistrationCode: { equals: workshopCode, mode: "insensitive" } },
          { slug: { equals: workshopCode, mode: "insensitive" } }
        ]
      },
      include: { controlSettings: true, branches: true }
    });
    if (!tenant || !tenant.customerRegistrationEnabled || !tenant.portalEnabled) {
      throw new BadRequestException("Please use the workshop registration link or enter a valid workshop code.");
    }
    this.assertTenantAvailable(tenant);
    const fullName = this.requiredText(dto.fullName, "Full name", 120);
    const phone = this.normalizePhone(dto.phone);
    const email = dto.email ? String(dto.email).trim().toLowerCase() : undefined;
    const loginIdentifier = email || phone;
    this.assertPassword(dto.password);
    if (dto.branchId && !tenant.branches.some((branch) => branch.id === dto.branchId)) {
      throw new BadRequestException("Selected branch does not belong to this workshop.");
    }
    const duplicate = await this.prisma.account.findUnique({ where: { loginIdentifier } });
    if (duplicate) throw new ConflictException("An account already exists for this email or phone.");

    const account = await this.prisma.$transaction(async (tx) => {
      const createdAccount = await tx.account.create({
        data: {
          tenantId: tenant.id,
          accountType: AccountType.CUSTOMER,
          loginIdentifier,
          passwordHash: this.passwordHash(dto.password),
          status: AccountStatus.ACTIVE
        }
      });
      const customer = await tx.customer.create({
        data: {
          tenantId: tenant.id,
          accountId: createdAccount.id,
          branchId: dto.branchId || null,
          fullName,
          phone,
          email,
          portalStatus: PortalStatus.ENABLED,
          communicationConsent: Boolean(dto.communicationConsent)
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorType: AuditActorType.CUSTOMER,
          actorId: customer.id,
          actorName: customer.fullName,
          action: "auth.customer.registered",
          targetType: "customer",
          targetId: customer.id,
          reason: "Customer self-registered using valid workshop context.",
          after: { workshopCodeResolved: true, branchId: dto.branchId || null, accountType: "customer" }
        }
      });
      return tx.account.findUniqueOrThrow({ where: { id: createdAccount.id }, include: this.accountGraph() });
    });
    const login = await this.createSession(account, "Customer registered and entered the portal.");
    return {
      ...login,
      registration: { customerId: account.customer!.id, tenantId: tenant.id, workshopName: tenant.name }
    };
  }

  async invitationInfo(token: string) {
    const account = await this.prisma.account.findUnique({
      where: { inviteTokenHash: this.hashTokenSecret(String(token || "")) },
      include: this.accountGraph()
    });
    if (!account || account.status !== AccountStatus.INVITED || !account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
      return { valid: false };
    }
    return {
      valid: true,
      accountType: account.staffUser?.isTenantOwner ? "owner" : "staff",
      displayName: account.staffUser?.name,
      workshopName: account.tenant?.name,
      expiresAt: account.inviteExpiresAt.toISOString()
    };
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<LoginResponseDto> {
    this.assertPassword(dto.password);
    const tokenHash = this.hashTokenSecret(String(dto.token || ""));
    const account = await this.prisma.account.findUnique({
      where: { inviteTokenHash: tokenHash },
      include: this.accountGraph()
    });
    if (!account || account.status !== AccountStatus.INVITED || !account.inviteExpiresAt || account.inviteExpiresAt <= new Date()) {
      throw new BadRequestException("Invitation is invalid or expired.");
    }
    this.assertTenantAvailable(account.tenant);
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: {
          passwordHash: this.passwordHash(dto.password),
          status: AccountStatus.ACTIVE,
          inviteTokenHash: null,
          inviteExpiresAt: null
        }
      });
      if (account.staffUser) {
        await tx.staffUser.update({ where: { id: account.staffUser.id }, data: { status: StaffStatus.ACTIVE } });
      }
      await tx.auditLog.create({
        data: {
          tenantId: account.tenantId,
          actorType: AuditActorType.TENANT_STAFF,
          actorId: account.staffUser?.id,
          actorName: account.staffUser?.name || account.loginIdentifier,
          action: "auth.invitation.accepted",
          targetType: "account",
          targetId: account.id,
          reason: "Invited tenant user activated the account."
        }
      });
    });
    const activated = await this.prisma.account.findUniqueOrThrow({ where: { id: account.id }, include: this.accountGraph() });
    return this.createSession(activated, "Invitation accepted and account activated.");
  }

  async logout(token: string) {
    const [sessionId, accessSecret] = token.split(".");
    if (!sessionId || !accessSecret) return { status: "logged_out" };
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session?.refreshTokenHash && this.safeEqual(this.hashTokenSecret(accessSecret), session.refreshTokenHash)) {
      await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    return { status: "logged_out" };
  }

  async sessionFromToken(token: string): Promise<SessionContextDto> {
    const [sessionId, accessSecret] = token.split(".");
    if (!sessionId || !accessSecret) throw new UnauthorizedException("Invalid bearer token.");
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { account: { include: this.accountGraph() } }
    });
    if (!session || session.account.status !== AccountStatus.ACTIVE || session.account.accountType === AccountType.SYSTEM_AUTOMATION) {
      throw new UnauthorizedException("Session expired or revoked.");
    }
    if (!session.refreshTokenHash || !this.safeEqual(this.hashTokenSecret(accessSecret), session.refreshTokenHash)) {
      throw new UnauthorizedException("Invalid bearer token.");
    }
    this.assertAccountAndTenantAccess(session.account);
    return this.buildContext(session.id, session.account);
  }

  private async createSession(account: any, reason: string, meta: { userAgent?: string; ipAddress?: string } = {}): Promise<LoginResponseDto> {
    const accessSecret = randomBytes(32).toString("hex");
    const session = await this.prisma.session.create({
      data: {
        accountId: account.id,
        refreshTokenHash: this.hashTokenSecret(accessSecret),
        userAgent: meta.userAgent || null,
        ipAddress: meta.ipAddress || null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12)
      }
    });
    await this.prisma.account.update({ where: { id: account.id }, data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } });
    const context = await this.buildContext(session.id, account);
    await this.prisma.auditLog.create({
      data: {
        tenantId: account.tenantId,
        actorType: this.auditActor(account.accountType),
        actorId: account.staffUser?.id || account.customer?.id || account.id,
        actorName: context.displayName,
        action: "auth.login",
        targetType: "account",
        targetId: account.id,
        reason
      }
    });
    return { accessToken: `${session.id}.${accessSecret}`, refreshToken: "", session: context };
  }

  private async buildContext(sessionId: string, account: any): Promise<SessionContextDto> {
    const staff = account.staffUser;
    const customer = account.customer;
    const accountType = this.toAccountType(account.accountType);
    const roleId = staff?.role || (accountType === "customer" ? "customer" : "platform_super_admin");
    const effective = await this.effectiveAccess.resolve(account, roleId);
    const navigation = this.navigation(accountType, effective);
    const userOverrides = this.booleanRecord(staff?.userOverrides);

    return {
      sessionId,
      accountId: account.id,
      accountType,
      tenantId: account.tenantId || undefined,
      tenantName: account.tenant?.name,
      userId: staff?.id,
      customerId: customer?.id,
      displayName: staff?.name || customer?.fullName || account.loginIdentifier,
      landingPage: this.landingPage(roleId, effective.pages, effective.tenantStatus),
      roleId,
      roleLabel: roleId.replace(/_/g, " "),
      branchScope: staff?.branchScope || [],
      warehouseScope: staff?.warehouseScope || [],
      categoryScope: (staff?.categoryScope || []).map((code: string) => this.fromCategory(code)),
      teamScope: staff?.teamScope || [],
      managedTechnicianIds: staff?.managedTechnicianIds || [],
      permissionTemplateId: staff?.permissionTemplateId || undefined,
      userOverrides,
      effectivePermissionSources: effective.permissionSources,
      enabledModules: effective.enabledModules,
      enabledFeatures: effective.enabledFeatures,
      builderConfigVersion: effective.builderConfigVersion,
      tenantStatus: effective.tenantStatus,
      readOnly: effective.readOnly,
      linkedAssetIds: customer?.assets?.map((asset: any) => asset.id) || [],
      customerPortalStatus: customer?.portalStatus?.toLowerCase(),
      allowedControlScopes: accountType === "platform" ? ["platform:workshops", "platform:controls", "platform:live_view"] : [],
      supportAccessMode: "none",
      permissions: effective.permissions,
      navigation,
      workspace: this.workspace(account, roleId)
    };
  }

  private navigation(accountType: string, effective: EffectiveAccessResult): NavigationItemDto[] {
    return routeCatalog
      .filter((route) => (route.accountTypes as readonly string[]).includes(accountType))
      .map((route) => {
        const pageAllowed = effective.pages.includes(route.id);
        const permissionAllowed = effective.permissions.includes(route.permission);
        const allowed = pageAllowed && permissionAllowed;
        return {
          id: route.id,
          label: route.label,
          allowed,
          deniedReason: allowed
            ? undefined
            : effective.deniedRouteReasons[route.id] || (!pageAllowed ? "Page is disabled for this role." : `Missing permission: ${route.permission}`)
        };
      });
  }

  private landingPage(role: string, pages: string[], tenantStatus?: string) {
    if (tenantStatus === "pending_setup" && ["tenant_owner", "tenant_admin"].includes(role) && pages.includes("builder-home")) return "builder-home";
    const preferred: Record<string, string> = {
      platform_super_admin: "platform",
      tenant_owner: "builder-home",
      tenant_admin: "builder-home",
      branch_manager: "branch-home",
      technician: "technician",
      inventory_manager: "inventory-home",
      team_leader: "team-review",
      data_analyst: "analytics-home",
      customer: "customer"
    };
    const target = preferred[role];
    return target && pages.includes(target) ? target : pages[0] || "access-denied";
  }

  private workspace(account: any, roleId: string): WorkspaceDto {
    const staff = account.staffUser;
    const customer = account.customer;
    if (account.accountType === AccountType.PLATFORM) {
      return { type: "platform", label: "Platform scope", categoryScope: [], branchIds: [], warehouseIds: [] };
    }
    if (account.accountType === AccountType.CUSTOMER) {
      const asset = customer?.assets?.[0];
      return {
        type: "customer_asset",
        label: asset ? `${asset.name} - ${asset.primaryIdentifier}` : "Customer portal",
        category: asset ? this.fromCategory(asset.category) : undefined,
        categoryScope: asset ? [this.fromCategory(asset.category)] : [],
        branchIds: customer?.branchId ? [customer.branchId] : [],
        warehouseIds: [],
        assetId: asset?.id
      };
    }
    return {
      type: roleId === "inventory_manager" ? "warehouse" : "branch",
      label: roleId.replace(/_/g, " "),
      categoryScope: (staff?.categoryScope || []).map((code: string) => this.fromCategory(code)),
      branchIds: staff?.branchScope || [],
      warehouseIds: staff?.warehouseScope || []
    };
  }

  private assertAccountAndTenantAccess(account: any) {
    if (account.accountType === AccountType.PLATFORM && account.tenantId) {
      throw new UnauthorizedException("Platform accounts cannot be tenant-bound.");
    }
    if (account.accountType === AccountType.TENANT_STAFF) {
      if (!account.tenantId || !account.staffUser || account.staffUser.status !== StaffStatus.ACTIVE) {
        throw new UnauthorizedException("Staff account is not active.");
      }
      if (this.disabledRole(account.tenant?.controlSettings || [], account.staffUser.role)) {
        throw new UnauthorizedException("Staff role is disabled by Platform Super Admin control.");
      }
      if (account.staffUser.isTenantOwner && this.platformControlDisabled(account.tenant?.controlSettings || [], ["owner_login"])) {
        throw new UnauthorizedException("Tenant owner login is disabled by Platform Super Admin control.");
      }
    }
    if (account.accountType === AccountType.CUSTOMER) {
      if (!account.tenantId || !account.customer || account.customer.portalStatus !== PortalStatus.ENABLED) {
        throw new UnauthorizedException("Customer portal is temporarily unavailable. Please contact the workshop.");
      }
      if (this.platformControlDisabled(account.tenant?.controlSettings || [], ["customer_portal"])) {
        throw new UnauthorizedException("Customer portal access is disabled by Platform Super Admin control.");
      }
    }
    if (account.accountType !== AccountType.PLATFORM) this.assertPlatformTenantAccess(account.tenant, account.accountType);
  }

  private disabledRole(controlSettings: Array<{ key: string; value: unknown }>, role: string) {
    const normalizedRole = role.toLowerCase();
    return controlSettings.some((setting) => {
      const key = String(setting.key || "").toLowerCase();
      if (!key.includes(".role.")) return false;
      const controlKey = key.split(".role.").pop() || "";
      return controlKey === normalizedRole && this.disabledValue(setting.value);
    });
  }

  private platformControlDisabled(controlSettings: Array<{ key: string; value: unknown }>, candidates: string[]) {
    return controlSettings.some((setting) => {
      const key = String(setting.key || "").toLowerCase();
      if (!candidates.some((candidate) => key.includes(candidate))) return false;
      return this.disabledValue(setting.value);
    });
  }

  private disabledValue(value: unknown) {
    if (value === false) return true;
    const object = this.objectRecord(value);
    return object.value === false || object.enabled === false || ["hard_disable", "soft_disable", "disabled", "locked", "frozen", "archived"].includes(String(object.controlType || object.status || "").toLowerCase());
  }

  private objectRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private assertTenantAvailable(tenant: any) {
    this.assertPlatformTenantAccess(tenant);
  }

  private assertPlatformTenantAccess(tenant: any, accountType?: AccountType) {
    if (!tenant) throw new UnauthorizedException("Workspace context is missing.");
    const unavailableMessage =
      accountType === AccountType.CUSTOMER
        ? "Customer portal is temporarily unavailable. Please contact the workshop."
        : "Your workspace is temporarily unavailable. Please contact MOP support.";
    const platformStatus = tenant.controlSettings?.find((setting: any) => setting.key === "platform.tenant.status")?.value;
    const status = String(typeof platformStatus === "string" ? platformStatus : platformStatus?.value || tenant.status).toLowerCase();
    if (
      [TenantStatus.SUSPENDED, TenantStatus.FROZEN, TenantStatus.ARCHIVED].includes(tenant.status)
      || ["frozen", "suspended", "archived"].includes(status)
    ) {
      throw new UnauthorizedException(unavailableMessage);
    }
    if (tenant.portalEnabled === false && status !== "read_only") {
      throw new UnauthorizedException(unavailableMessage);
    }
  }

  private accountGraph() {
    return {
      tenant: { include: { controlSettings: true } },
      staffUser: true,
      customer: { include: { assets: true } }
    } as const;
  }

  private verifyPassword(password: string, storedHash: string) {
    const [scheme, salt, hash] = storedHash.split("$");
    if (!salt || !hash) return false;
    if (scheme === "scrypt2") return this.safeEqual(scryptSync(password, salt, 64, SCRYPT_PARAMS).toString("hex"), hash);
    if (scheme === "scrypt") return this.safeEqual(scryptSync(password, salt, 64, LEGACY_SCRYPT_PARAMS).toString("hex"), hash);
    return false;
  }

  private passwordHash(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `scrypt2$${salt}$${scryptSync(password, salt, 64, SCRYPT_PARAMS).toString("hex")}`;
  }

  private assertPassword(password: string) {
    if (!password || password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException("Password must be at least 10 characters and include upper-case, lower-case, and a number.");
    }
  }

  private normalizePhone(value: string) {
    const normalized = String(value || "").replace(/[^\d+]/g, "");
    if (normalized.length < 8 || normalized.length > 18) throw new BadRequestException("A valid phone number is required.");
    return normalized;
  }

  private requiredText(value: unknown, label: string, max: number) {
    const text = String(value || "").trim();
    if (!text) throw new BadRequestException(`${label} is required.`);
    if (text.length > max) throw new BadRequestException(`${label} is too long.`);
    return text;
  }

  private hashTokenSecret(secret: string) {
    return createHash("sha256").update(secret).digest("hex");
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async recordFailedLogin(account: any) {
    const failedLoginAttempts = Number(account.failedLoginAttempts || 0) + 1;
    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        failedLoginAttempts,
        lockedUntil: failedLoginAttempts >= LOGIN_LOCK_THRESHOLD ? new Date(Date.now() + LOGIN_LOCK_MS) : null
      }
    });
  }

  private toAccountType(type: AccountType): "platform" | "tenant_staff" | "customer" | "system" {
    if (type === AccountType.PLATFORM) return "platform";
    if (type === AccountType.CUSTOMER) return "customer";
    if (type === AccountType.SYSTEM_AUTOMATION) return "system";
    return "tenant_staff";
  }

  private fromCategory(code?: string): CategoryCode {
    if (code === "MOTORCYCLES") return "Motorcycles";
    if (code === "HEAVY_EQUIPMENT") return "Heavy Equipment";
    return "Cars";
  }

  private auditActor(type: AccountType) {
    if (type === AccountType.PLATFORM) return AuditActorType.PLATFORM;
    if (type === AccountType.CUSTOMER) return AuditActorType.CUSTOMER;
    if (type === AccountType.SYSTEM_AUTOMATION) return AuditActorType.SYSTEM;
    return AuditActorType.TENANT_STAFF;
  }

  private booleanRecord(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  }

  private async deniedLogin(tenantId: string | null | undefined, accountId: string | undefined, identifier: string, reason: string) {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorType: AuditActorType.SYSTEM,
        actorName: "Authentication Gateway",
        action: "auth.login.denied",
        targetType: "account",
        targetId: accountId,
        reason,
        after: { identifierHash: createHash("sha256").update(identifier).digest("hex") }
      }
    });
  }
}
