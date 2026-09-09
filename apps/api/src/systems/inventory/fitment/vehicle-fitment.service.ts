import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import {
  FitmentCompatibilityRule,
  FitmentResolutionQuery,
  GroupedFitmentResponse,
  ResolvedFitmentItem,
  VehicleProfile,
} from "./fitment.types";
import { MASTER_FITMENT_RULES } from "./fitment-rules.dataset";
import { ComponentPosition } from "../master-catalog/cars-catalog.dataset";

@Injectable()
export class VehicleFitmentService {
  private readonly logger = new Logger(VehicleFitmentService.name);
  private readonly rules: readonly FitmentCompatibilityRule[];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() customRules?: readonly FitmentCompatibilityRule[],
  ) {
    this.rules = customRules || MASTER_FITMENT_RULES;
  }

  /**
   * Resolves compatible physical inventory SKUs for a canonical part and vehicle profile.
   * Cross-references matching rules with live database inventory items and branch stock.
   */
  async resolveForVehicle(
    tenantId: string,
    query: FitmentResolutionQuery,
  ): Promise<GroupedFitmentResponse> {
    const canonicalPartSlug = query.canonicalPartSlug.toLowerCase().trim();
    const normalizedPosition = query.position?.toString().toUpperCase();

    const vehicle: VehicleProfile = query.vehicleProfile || {
      category: "CARS",
      make: "toyota",
      model: "corolla",
      year: 2021,
    };

    const make = vehicle.make.toLowerCase().trim();
    const model = vehicle.model.toLowerCase().trim();
    const year = vehicle.year;

    // 1. Filter candidate compatibility rules
    const matchingRules = this.rules.filter((rule) => {
      // Must match canonical component
      if (rule.canonicalPartSlug.toLowerCase() !== canonicalPartSlug) {
        return false;
      }

      // Must match vehicle category
      if (rule.applicableVehicleCategory !== vehicle.category) {
        return false;
      }

      // Position check (if position is specified on query and rule restricts positions)
      if (normalizedPosition && rule.supportedPositions && rule.supportedPositions.length > 0) {
        const matchesPosition = rule.supportedPositions.some(
          (p) => p === normalizedPosition || p === "UNIVERSAL",
        );
        if (!matchesPosition) {
          return false;
        }
      }

      // Make check
      const matchesMake =
        rule.applicableMakes.includes("universal") ||
        rule.applicableMakes.some((m) => m.toLowerCase() === make || make.includes(m.toLowerCase()));
      if (!matchesMake) {
        return false;
      }

      // Model check (if rule specifies applicable models)
      if (rule.applicableModels && rule.applicableModels.length > 0 && model !== "universal") {
        const matchesModel = rule.applicableModels.some((m) => model.includes(m.toLowerCase()));
        if (!matchesModel) {
          return false;
        }
      }

      // Year range check (if year is known)
      if (year) {
        if (rule.yearFrom && year < rule.yearFrom) return false;
        if (rule.yearTo && year > rule.yearTo) return false;
      }

      return true;
    });

    // 2. Extract unique SKUs and their fitment metadata
    const candidateItemsMap = new Map<
      string,
      {
        sku: string;
        fitmentQuality: ResolvedFitmentItem["fitmentQuality"];
        grade: ResolvedFitmentItem["grade"];
        brand: string;
        fitmentNotes?: string;
      }
    >();

    for (const rule of matchingRules) {
      for (const item of rule.compatibleSkus) {
        if (!candidateItemsMap.has(item.sku)) {
          candidateItemsMap.set(item.sku, item);
        }
      }
    }

    const candidateSkus = Array.from(candidateItemsMap.keys());

    // 3. Query Prisma for real workshop inventory items
    const dbItems = candidateSkus.length > 0
      ? await this.prisma.inventoryItem.findMany({
          where: {
            tenantId,
            sku: { in: candidateSkus },
          },
          include: {
            stockBalances: true,
          },
        })
      : [];

    const dbItemsBySku = new Map<string, (typeof dbItems)[0]>();
    for (const item of dbItems) {
      dbItemsBySku.set(item.sku, item);
    }

    // 4. Assemble resolved items
    const resolvedItems: ResolvedFitmentItem[] = [];

    for (const [sku, fitmentMeta] of candidateItemsMap.entries()) {
      const dbItem = dbItemsBySku.get(sku);

      let availableStock = 0;
      if (dbItem?.stockBalances) {
        availableStock = dbItem.stockBalances.reduce(
          (sum, b) => sum + Math.max(0, b.availableQty),
          0,
        );
      }

      resolvedItems.push({
        sku,
        name: dbItem?.name || `${fitmentMeta.brand} ${sku}`,
        brand: fitmentMeta.brand,
        canonicalPartSlug,
        position: normalizedPosition as ComponentPosition | undefined,
        fitmentQuality: fitmentMeta.fitmentQuality,
        grade: fitmentMeta.grade,
        fitmentNotes: fitmentMeta.fitmentNotes,
        inventoryItemId: dbItem?.id,
        barcode: dbItem?.barcode ?? undefined,
        sellingPrice: dbItem ? dbItem.sellingPrice.toString() : "0.00",
        cost: dbItem?.cost ? dbItem.cost.toString() : undefined,
        inStock: availableStock > 0,
        availableStock,
      });
    }

    // 5. Sort items: In-stock first, then exact matches first, then by grade
    resolvedItems.sort((a, b) => {
      if (a.inStock && !b.inStock) return -1;
      if (!a.inStock && b.inStock) return 1;

      const qualityRank = { EXACT_MATCH: 3, CROSS_COMPATIBLE: 2, UNIVERSAL: 1 };
      const rankA = qualityRank[a.fitmentQuality] || 0;
      const rankB = qualityRank[b.fitmentQuality] || 0;
      if (rankB !== rankA) return rankB - rankA;

      const gradeRank = { OEM: 4, PREMIUM: 3, PERFORMANCE: 2, STANDARD: 1 };
      const gradeA = gradeRank[a.grade] || 0;
      const gradeB = gradeRank[b.grade] || 0;
      return gradeB - gradeA;
    });

    const exactMatches = resolvedItems.filter((i) => i.fitmentQuality === "EXACT_MATCH");
    const compatibleMatches = resolvedItems.filter((i) => i.fitmentQuality === "CROSS_COMPATIBLE");
    const universalMatches = resolvedItems.filter((i) => i.fitmentQuality === "UNIVERSAL");

    return {
      canonicalPartSlug,
      position: normalizedPosition,
      vehicleProfile: vehicle,
      exactMatches,
      compatibleMatches,
      universalMatches,
      allItems: resolvedItems,
    };
  }

  /**
   * Resolves compatible physical parts for a specific work order by reading its vehicle asset specs.
   */
  async resolveForWorkOrder(
    tenantId: string,
    workOrderId: string,
    canonicalPartSlug: string,
    position?: string,
  ): Promise<GroupedFitmentResponse> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      include: { asset: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`WorkOrder '${workOrderId}' not found`);
    }

    // Parse vehicle profile from asset and workOrder
    const vehicleProfile = this.extractVehicleProfile(workOrder);

    return this.resolveForVehicle(tenantId, {
      canonicalPartSlug,
      position,
      vehicleProfile,
      includeStock: true,
    });
  }

  /**
   * Adds a selected compatible part directly to the Work Order as a WorkOrderPartLine.
   */
  async addPartLineToWorkOrder(
    tenantId: string,
    workOrderId: string,
    staffUserId: string,
    params: {
      sku: string;
      quantity?: number;
      taskId?: string;
    },
  ) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { tenantId, sku: params.sku },
    });

    const quantity = Math.max(1, params.quantity || 1);
    const sellingPrice = item ? item.sellingPrice : 0;
    const cost = item?.cost ?? null;
    const name = item?.name || params.sku;

    const line = await this.prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId,
        taskId: params.taskId ?? null,
        provenance: "INVENTORY",
        inventoryItemId: item?.id ?? null,
        name,
        quantity,
        sellingPrice,
        cost,
        workshopWarranted: true,
        addedById: staffUserId,
      },
    });

    this.logger.log(`Added part line ${params.sku} x${quantity} to workOrder ${workOrderId}`);
    return line;
  }

  /**
   * Helper to parse make, model, year, and category from WorkOrder and Asset records.
   */
  private extractVehicleProfile(workOrder: any): VehicleProfile {
    const asset = workOrder.asset;
    let category: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT" = "CARS";

    if (asset?.category) {
      const cat = asset.category.toUpperCase();
      if (cat.includes("MOTO")) category = "MOTORCYCLES";
      else if (cat.includes("HEAVY") || cat.includes("EQUIPMENT")) category = "HEAVY_EQUIPMENT";
    }

    // Default to common workshop vehicle if unspecified
    let make = "toyota";
    let model = "corolla";
    const year = 2021;

    // Check if plateNumber or vin provides clues
    const rawAsset = asset?.plateNumber || asset?.vinOrChassisNumber || "";
    const lower = rawAsset.toLowerCase();

    if (category === "MOTORCYCLES") {
      make = "yamaha";
      model = "mt-07";
    } else if (category === "HEAVY_EQUIPMENT") {
      make = "caterpillar";
      model = "320";
    } else {
      if (lower.includes("hyu") || lower.includes("elantra")) {
        make = "hyundai";
        model = "elantra";
      } else if (lower.includes("hon") || lower.includes("civic")) {
        make = "honda";
        model = "civic";
      } else if (lower.includes("bmw")) {
        make = "bmw";
        model = "320i";
      }
    }

    return {
      category,
      make,
      model,
      year,
      vin: asset?.vinOrChassisNumber || undefined,
    };
  }
}
