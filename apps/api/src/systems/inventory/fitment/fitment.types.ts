import { ComponentPosition } from "../master-catalog/cars-catalog.dataset";

export type FitmentQuality = "EXACT_MATCH" | "CROSS_COMPATIBLE" | "UNIVERSAL";

export type PartGrade = "OEM" | "PREMIUM" | "STANDARD" | "PERFORMANCE";

export interface VehicleProfile {
  readonly category: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
  readonly make: string;
  readonly model: string;
  readonly year?: number;
  readonly trim?: string;
  readonly engineCode?: string;
  readonly vin?: string;
}

export interface FitmentRuleItem {
  readonly sku: string;
  readonly fitmentQuality: FitmentQuality;
  readonly grade: PartGrade;
  readonly brand: string;
  readonly fitmentNotes?: string;
}

export interface FitmentCompatibilityRule {
  readonly id: string;
  readonly canonicalPartSlug: string;
  readonly supportedPositions?: readonly ComponentPosition[];
  readonly applicableVehicleCategory: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
  readonly applicableMakes: readonly string[];
  readonly applicableModels?: readonly string[];
  readonly yearFrom?: number;
  readonly yearTo?: number;
  readonly compatibleSkus: readonly FitmentRuleItem[];
}

export interface ResolvedFitmentItem {
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly canonicalPartSlug: string;
  readonly position?: ComponentPosition;
  readonly fitmentQuality: FitmentQuality;
  readonly grade: PartGrade;
  readonly fitmentNotes?: string;
  readonly inventoryItemId?: string;
  readonly barcode?: string;
  readonly sellingPrice: number;
  readonly cost?: number;
  readonly inStock: boolean;
  readonly availableStock: number;
}

export interface FitmentResolutionQuery {
  readonly canonicalPartSlug: string;
  readonly position?: ComponentPosition | string;
  readonly vehicleProfile?: VehicleProfile;
  readonly includeStock?: boolean;
}

export interface GroupedFitmentResponse {
  readonly canonicalPartSlug: string;
  readonly position?: string;
  readonly vehicleProfile: VehicleProfile;
  readonly exactMatches: readonly ResolvedFitmentItem[];
  readonly compatibleMatches: readonly ResolvedFitmentItem[];
  readonly universalMatches: readonly ResolvedFitmentItem[];
  readonly allItems: readonly ResolvedFitmentItem[];
}
