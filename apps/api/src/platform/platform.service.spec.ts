import { ConflictException } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SpecializationService } from "../specialization/specialization.service";
import type { CreateWorkshopDto } from "./create-workshop.dto";

describe("PlatformService", () => {
  function createSpecializationServiceMock() {
    return { defineCard: jest.fn().mockResolvedValue({}) } as unknown as SpecializationService;
  }

  function createTxMock() {
    return {
      tenant: {
        create: jest.fn().mockResolvedValue({ id: "tenant-1", name: "Test Workshop", slug: "test-workshop", planId: "plan-1" }),
      },
      tenantConfiguration: { create: jest.fn().mockResolvedValue({}) },
      account: { create: jest.fn().mockResolvedValue({ id: "account-owner-1" }) },
      staffUser: { create: jest.fn().mockResolvedValue({ id: "staff-1" }) },
      // createMany, not create: the baseline seeding writes several
      // hundred rows and does it in two statements rather than a loop
      // inside the creation transaction.
      rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 0 }), upsert: jest.fn().mockResolvedValue({}) },
      rolePage: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tenantCapability: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      workshopPolicy: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      financeConfiguration: { create: jest.fn().mockResolvedValue({}) },
      branch: { create: jest.fn().mockResolvedValue({ id: "branch-1" }) },
      warehouse: { create: jest.fn().mockResolvedValue({ id: "warehouse-1" }) },
      branchWarehouseAccess: { create: jest.fn().mockResolvedValue({}) },
      priceCatalogEntry: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      tenantConfigurationVersion: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  function createPrismaMock(tx: ReturnType<typeof createTxMock>, overrides: { existingAccount?: unknown } = {}) {
    return {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
      account: { findFirst: jest.fn().mockResolvedValue(overrides.existingAccount ?? null) },
      plan: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "plan-1", maxBranches: 5, maxUsers: 20, maxWarehouses: 5 }),
      },
    } as unknown as PrismaService;
  }

  function createDto(overrides: Partial<CreateWorkshopDto> = {}): CreateWorkshopDto {
    return {
      planId: "plan-1",
      name: "Test Workshop",
      slug: "test-workshop",
      country: "EG",
      city: "Cairo",
      businessType: "Independent Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
      ownerFullName: "New Owner",
      ownerEmail: "owner@example.com",
      ownerPhone: "+201234567890",
      allowedBranchesStart: 1,
      allowedUsersStart: 5,
      allowedWarehousesStart: 1,
      starterBuilderTemplate: "DEFAULT",
      initialStatus: "ACTIVE",
      // Inventory is on unless a capability row says otherwise, so this
      // workshop needs a store -- creation refuses stock with nowhere to
      // hold it, and a fixture that skipped it would be testing a
      // configuration the product will not create.
      branches: [{ name: "Main", code: "MAIN" }],
      warehouses: [{ name: "Main store", code: "WH1", branchCodes: ["MAIN"] }],
      ...overrides,
    } as CreateWorkshopDto;
  }

  it("creates the tenant, its configuration, an INVITED owner account with no password, and the owner staff profile, all inside one transaction", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx);
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    const result = await service.createWorkshop(createDto(), { accountId: "platform-1", displayName: "Platform Admin" });

    expect(tx.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Test Workshop", nameNormalized: "test workshop", status: "ACTIVE", planId: "plan-1" }),
      }),
    );
    expect(tx.tenantConfiguration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "tenant-1", enabledFeatures: [] }) }),
    );
    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: "TENANT_STAFF",
          tenantId: "tenant-1",
          email: "owner@example.com",
          status: "INVITED",
          passwordHash: null,
        }),
      }),
    );
    expect(tx.staffUser.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accountId: "account-owner-1", role: "TENANT_OWNER", tenantId: "tenant-1" }) }),
    );
    expect(result.tenant).toEqual({ id: "tenant-1", name: "Test Workshop", slug: "test-workshop", planId: "plan-1" });
  });

  it("generates a real invite token, stores only its hash, and returns the raw token exactly once", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx);
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    const result = await service.createWorkshop(createDto(), { accountId: "platform-1", displayName: "Platform Admin" });

    const accountCall = (tx.account.create as jest.Mock).mock.calls[0][0];
    const storedHash: string = accountCall.data.inviteTokenHash;
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest, not a raw token
    expect(result.inviteLink).toMatch(/^\/invite\/accept\?token=[0-9a-f]{64}$/);
    const rawToken = result.inviteLink.split("token=")[1];
    expect(storedHash).not.toBe(rawToken); // the hash is never the raw token itself
  });

  it("seeds a baseline RolePermission and RolePage row for every one of the 7 tenant-staff roles, not just the owner's", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx);
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    await service.createWorkshop(createDto(), { accountId: "platform-1", displayName: "Platform Admin" });

    // One createMany per table, so the roles are read out of the single
    // batch each one was given rather than out of a call log.
    type SeededRow = { role: string };
    const permissionRows = (tx.rolePermission.createMany as jest.Mock).mock.calls[0][0].data as SeededRow[];
    const pageRows = (tx.rolePage.createMany as jest.Mock).mock.calls[0][0].data as SeededRow[];
    const seededRoles = new Set(permissionRows.map((row) => row.role));
    const pagedRoles = new Set(pageRows.map((row) => row.role));
    for (const role of ["TENANT_OWNER", "TENANT_ADMIN", "BRANCH_MANAGER", "TECHNICIAN", "INVENTORY_MANAGER", "TEAM_LEADER", "DATA_ANALYST"]) {
      expect(pagedRoles.has(role)).toBe(true);
    }
    expect(seededRoles.has("TENANT_OWNER")).toBe(true);
    expect(seededRoles.has("TECHNICIAN")).toBe(true);
  });

  it("rejects with 409 before ever starting the transaction when the owner email is already registered anywhere", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx, { existingAccount: { id: "existing-1" } });
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    await expect(service.createWorkshop(createDto(), { accountId: "platform-1", displayName: "Platform Admin" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when a soft-target start count exceeds the selected plan's ceiling", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx);
    (prisma.plan.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: "plan-1", maxBranches: 1, maxUsers: 20, maxWarehouses: 5 });
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    await expect(
      service.createWorkshop(createDto({ allowedBranchesStart: 3 }), { accountId: "platform-1", displayName: "Platform Admin" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records a HIGH-risk audit entry naming the real creator, inside the same transaction", async () => {
    const tx = createTxMock();
    const prisma = createPrismaMock(tx);
    const auditService = { record: jest.fn().mockResolvedValue({}) } as unknown as AuditService;
    const service = new PlatformService(prisma, auditService, createSpecializationServiceMock());

    await service.createWorkshop(createDto(), { accountId: "platform-1", displayName: "Platform Admin" });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorId: "platform-1",
        actorType: "PLATFORM",
        actorName: "Platform Admin",
        targetType: "Tenant",
        targetId: "tenant-1",
        action: "platform.workshop.created",
        riskLevel: "HIGH",
      }),
      tx,
    );
  });
});
