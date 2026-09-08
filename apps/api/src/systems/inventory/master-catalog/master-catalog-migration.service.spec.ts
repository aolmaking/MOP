import { MasterCatalogMigrationService, CURRENT_MASTER_CATALOG_VERSION } from "./master-catalog-migration.service";

describe("MasterCatalogMigrationService (Safe Non-Destructive Catalog Versioning)", () => {
  let migrationService: MasterCatalogMigrationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      priceCatalogEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    migrationService = new MasterCatalogMigrationService(mockPrisma);
  });

  it("preserves customized workshop labor prices without overwriting", async () => {
    const tenantId = "workshop-apex";
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: tenantId,
      slug: "apex-motors",
      name: "Apex Motors",
      primaryCategory: "CARS",
    });

    // Simulate an existing custom price for front brake pads set by the workshop owner
    mockPrisma.priceCatalogEntry.findFirst.mockImplementation((query: any) => {
      if (query.where.itemKey.in.includes("Brake Pad & Rotor Replacement (Front)")) {
        return Promise.resolve({
          id: "custom-entry-1",
          tenantId,
          itemKey: "Brake Pad & Rotor Replacement (Front)",
          laborPrice: "750.00", // Customized by workshop
          isActive: true,
        });
      }
      return Promise.resolve(null);
    });

    mockPrisma.priceCatalogEntry.create.mockResolvedValue({ id: "new-entry" });

    const result = await migrationService.migrateTenant(tenantId);

    expect(result.tenantSlug).toBe("apex-motors");
    expect(result.targetVersion).toBe(CURRENT_MASTER_CATALOG_VERSION);
    expect(result.customPricesPreserved).toBeGreaterThanOrEqual(1);

    // CRITICAL: Ensure create was NEVER called for the customized front brake pad service
    const createCalls = mockPrisma.priceCatalogEntry.create.mock.calls;
    const overwrittenAttempt = createCalls.find(
      (call: any) => call[0]?.data?.itemKey === "Brake Pad & Rotor Replacement (Front)"
    );
    expect(overwrittenAttempt).toBeUndefined();

    // Ensure update was NEVER called to overwrite laborPrice
    expect(mockPrisma.priceCatalogEntry.update).not.toHaveBeenCalled();
  });
});
