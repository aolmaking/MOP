import { VehicleFitmentService } from "./vehicle-fitment.service";
import { PrismaService } from "../../../runtime/database/prisma.service";

describe("VehicleFitmentService (Phase D & E Vehicle Fitment & POS Stock Integration)", () => {
  let service: VehicleFitmentService;
  let prismaMock: any;
  const mockInventoryItems: any[] = [];
  const mockStockBalances: any[] = [];
  const mockPartLines: any[] = [];

  beforeEach(() => {
    mockInventoryItems.length = 0;
    mockStockBalances.length = 0;
    mockPartLines.length = 0;

    // Seed mock inventory items
    mockInventoryItems.push(
      {
        id: "item-toy-pad-fr",
        tenantId: "tenant-demo",
        sku: "BRK-PAD-TOY-01",
        name: "Toyota Genuine Ceramic Front Brake Pads",
        barcode: "04465-02220",
        sellingPrice: "68.00",
        cost: "42.50",
      },
      {
        id: "item-toy-pad-rr",
        tenantId: "tenant-demo",
        sku: "BRK-PAD-TOY-02",
        name: "Toyota Genuine Ceramic Rear Brake Pads",
        barcode: "04466-02180",
        sellingPrice: "58.00",
        cost: "36.00",
      },
      {
        id: "item-bosch-pad-rr",
        tenantId: "tenant-demo",
        sku: "BRK-PAD-REAR-03",
        name: "Bosch QuietCast Premium Ceramic Rear Brake Pad Set",
        barcode: "BP1354",
        sellingPrice: "48.00",
        cost: "28.00",
      },
      {
        id: "item-hyu-pad-fr",
        tenantId: "tenant-demo",
        sku: "BRK-PAD-HYU-01",
        name: "Brembo Premium Ceramic Front Brake Pads (Hyundai / Kia)",
        barcode: "P30056N",
        sellingPrice: "58.00",
        cost: "34.00",
      },
      {
        id: "item-bat-bosch-h6",
        tenantId: "tenant-demo",
        sku: "BAT-AGM-BOSCH-H6",
        name: "Bosch S6 High Performance AGM 12V 70Ah 760CCA Battery",
        barcode: "S6585B",
        sellingPrice: "210.00",
        cost: "145.00",
      },
      {
        id: "item-did-chain",
        tenantId: "tenant-demo",
        sku: "DID-CHN-520VX3-120",
        name: "D.I.D 520VX3 Pro-Street X-Ring Gold Drive Chain (120 Links)",
        barcode: "DID520VX3-120",
        sellingPrice: "115.00",
        cost: "72.00",
      },
      {
        id: "item-cat-fuel-filter",
        tenantId: "tenant-demo",
        sku: "CAT-FLT-1R0716",
        name: "Caterpillar Genuine High Efficiency Fuel Filter 1R-0716",
        barcode: "1R-0716",
        sellingPrice: "38.00",
        cost: "22.00",
      },
    );

    // Seed mock stock balances
    mockStockBalances.push(
      {
        inventoryItemId: "item-toy-pad-fr",
        tenantId: "tenant-demo",
        warehouseId: "wh-1",
        availableQty: 15,
      },
      {
        inventoryItemId: "item-toy-pad-rr",
        tenantId: "tenant-demo",
        warehouseId: "wh-1",
        availableQty: 14,
      },
      {
        inventoryItemId: "item-bosch-pad-rr",
        tenantId: "tenant-demo",
        warehouseId: "wh-1",
        availableQty: 0, // out of stock
      },
      {
        inventoryItemId: "item-bat-bosch-h6",
        tenantId: "tenant-demo",
        warehouseId: "wh-1",
        availableQty: 4,
      },
    );

    prismaMock = {
      inventoryItem: {
        findMany: jest.fn().mockImplementation(async (args: any) => {
          const skus: string[] = args.where.sku.in;
          return mockInventoryItems
            .filter((i) => i.tenantId === args.where.tenantId && skus.includes(i.sku))
            .map((item) => ({
              ...item,
              stockBalances: mockStockBalances.filter((b) => b.inventoryItemId === item.id),
            }));
        }),
        findFirst: jest.fn().mockImplementation(async (args: any) => {
          return (
            mockInventoryItems.find(
              (i) => i.tenantId === args.where.tenantId && i.sku === args.where.sku,
            ) || null
          );
        }),
      },
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "wo-fit-1",
          tenantId: "tenant-demo",
          asset: {
            category: "CARS",
            plateNumber: "ABC 1234",
            vinOrChassisNumber: "1NXBR32E7MZ123456",
          },
        }),
      },
      workOrderPartLine: {
        create: jest.fn().mockImplementation(async (args: any) => {
          const line = { id: `line-${mockPartLines.length + 1}`, ...args.data };
          mockPartLines.push(line);
          return line;
        }),
      },
    };

    service = new VehicleFitmentService(prismaMock as unknown as PrismaService);
  });

  describe("Vehicle Fitment Resolution (Phase D)", () => {
    it("resolves exact match OEM front brake pads for Toyota Corolla 2021 and suppresses rear pads", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        vehicleProfile: {
          category: "CARS",
          make: "Toyota",
          model: "Corolla",
          year: 2021,
        },
      });

      expect(res.canonicalPartSlug).toBe("brake-pads-front");
      expect(res.exactMatches.length).toBe(1);

      const exact = res.exactMatches[0];
      expect(exact.sku).toBe("BRK-PAD-TOY-01");
      expect(exact.brand).toBe("Toyota Genuine Parts");
      expect(exact.grade).toBe("OEM");
      expect(exact.fitmentQuality).toBe("EXACT_MATCH");

      // Verify position suppression: rear brake pads (BRK-PAD-TOY-02) should NOT be in the response
      const rearItem = res.allItems.find((i) => i.sku === "BRK-PAD-TOY-02");
      expect(rearItem).toBeUndefined();
    });

    it("resolves multiple tiers for Toyota rear brake pads (OEM exact match + Bosch premium compatible)", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "brake-pads-rear",
        position: "REAR",
        vehicleProfile: {
          category: "CARS",
          make: "Toyota",
          model: "Corolla",
          year: 2021,
        },
      });

      expect(res.exactMatches.length).toBe(1);
      expect(res.exactMatches[0].sku).toBe("BRK-PAD-TOY-02");
      expect(res.exactMatches[0].grade).toBe("OEM");

      expect(res.compatibleMatches.length).toBe(1);
      expect(res.compatibleMatches[0].sku).toBe("BRK-PAD-REAR-03");
      expect(res.compatibleMatches[0].brand).toBe("Bosch Automotive");
    });

    it("resolves Brembo ceramic pads for Hyundai Elantra", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        vehicleProfile: {
          category: "CARS",
          make: "Hyundai",
          model: "Elantra",
          year: 2020,
        },
      });

      expect(res.exactMatches.length).toBe(1);
      expect(res.exactMatches[0].sku).toBe("BRK-PAD-HYU-01");
      expect(res.exactMatches[0].brand).toBe("Brembo North America");
    });

    it("resolves multi-tier 12V starting battery options for passenger cars", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "12v-starting-battery",
        vehicleProfile: {
          category: "CARS",
          make: "Toyota",
          model: "Camry",
          year: 2020,
        },
      });

      expect(res.allItems.length).toBeGreaterThanOrEqual(1);
      const boschBattery = res.allItems.find((i) => i.sku === "BAT-AGM-BOSCH-H6");
      expect(boschBattery).toBeDefined();
      expect(boschBattery?.brand).toBe("Bosch Automotive");
    });

    it("resolves motorcycle drive chain for Yamaha MT-07", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "moto-drive-chain",
        position: "REAR",
        vehicleProfile: {
          category: "MOTORCYCLES",
          make: "Yamaha",
          model: "MT-07",
          year: 2022,
        },
      });

      expect(res.exactMatches.length).toBe(1);
      expect(res.exactMatches[0].sku).toBe("DID-CHN-520VX3-120");
      expect(res.exactMatches[0].brand).toBe("D.I.D Japan");
    });

    it("resolves heavy equipment fuel filter for Caterpillar excavator", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "heavy-fuel-filter",
        vehicleProfile: {
          category: "HEAVY_EQUIPMENT",
          make: "Caterpillar",
          model: "320D",
          year: 2019,
        },
      });

      expect(res.exactMatches.length).toBe(1);
      expect(res.exactMatches[0].sku).toBe("CAT-FLT-1R0716");
      expect(res.exactMatches[0].brand).toBe("Caterpillar Inc.");
    });
  });

  describe("POS Live Stock & Pricing Integration (Phase E)", () => {
    it("joins live database inventory items with branch stock balance and workshop selling price", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "brake-pads-front",
        position: "FRONT",
        vehicleProfile: {
          category: "CARS",
          make: "Toyota",
          model: "Corolla",
          year: 2021,
        },
        includeStock: true,
      });

      const item = res.exactMatches[0];
      expect(item.inventoryItemId).toBe("item-toy-pad-fr");
      expect(item.sellingPrice).toBe(68);
      expect(item.inStock).toBe(true);
      expect(item.availableStock).toBe(15); // 18 onHand - 3 allocated
    });

    it("ranks in-stock items ahead of out-of-stock items within same quality group", async () => {
      const res = await service.resolveForVehicle("tenant-demo", {
        canonicalPartSlug: "brake-pads-rear",
        position: "REAR",
        vehicleProfile: {
          category: "CARS",
          make: "Toyota",
          model: "Corolla",
          year: 2021,
        },
        includeStock: true,
      });

      // BRK-PAD-TOY-02 has 14 in stock; BRK-PAD-REAR-03 has 0
      expect(res.allItems[0].sku).toBe("BRK-PAD-TOY-02");
      expect(res.allItems[0].inStock).toBe(true);
    });

    it("resolves compatible parts from Work Order asset and adds selected part line directly", async () => {
      // 1. Resolve for work order
      const fitmentRes = await service.resolveForWorkOrder(
        "tenant-demo",
        "wo-fit-1",
        "brake-pads-front",
        "FRONT",
      );
      expect(fitmentRes.exactMatches.length).toBe(1);
      expect(fitmentRes.exactMatches[0].sku).toBe("BRK-PAD-TOY-01");

      // 2. Select part and add to Work Order
      const line = await service.addPartLineToWorkOrder("tenant-demo", "wo-fit-1", "tech-42", {
        sku: "BRK-PAD-TOY-01",
        quantity: 1,
      });

      expect(line.id).toBeDefined();
      expect(line.workOrderId).toBe("wo-fit-1");
      expect(line.name).toBe("Toyota Genuine Ceramic Front Brake Pads");
      expect(line.quantity).toBe(1);
      expect(line.sellingPrice).toBe("68.00");
      expect(line.provenance).toBe("INVENTORY");
      expect(mockPartLines.length).toBe(1);
    });
  });
});
