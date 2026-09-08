import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class RegisterCustomerVehicleDto {
  @IsString()
  fullName!: string;

  @IsString()
  phone!: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  plateNumber!: string;

  @IsString()
  @IsOptional()
  category?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";

  @IsString()
  @IsOptional()
  vinOrChassisNumber?: string;
}

export class OperatorIntakeDto {
  @IsString()
  assetId!: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  complaint!: string;

  @IsBoolean()
  @IsOptional()
  inspectionDeclined?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  inspectionParts?: string[];
}

export class OperatorPosLineDto {
  @IsString()
  inventoryItemId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class OperatorPosOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperatorPosLineDto)
  lines!: OperatorPosLineDto[];

  @IsString()
  @IsOptional()
  customerId?: string;
}

export class OperatorUpdateQuoteDto {
  @IsOptional()
  @IsArray()
  findings?: Array<{
    id?: string;
    description: string;
    severity: "CRITICAL" | "MEDIUM" | "LOW";
    recommendedService?: string;
    code?: string;
  }>;

  @IsOptional()
  @IsArray()
  parts?: Array<{
    inventoryItemId?: string;
    name: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
  }>;

  @IsOptional()
  @IsArray()
  services?: Array<{
    id?: string;
    name: string;
    laborPrice: number;
    hours?: number;
  }>;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OperatorDispatchRepairDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  tasksToCreate?: string[];

  @IsOptional()
  @IsArray()
  approvedFindings?: any[];

  @IsOptional()
  @IsArray()
  approvedServices?: any[];

  @IsOptional()
  @IsArray()
  approvedFindingIds?: string[];

  @IsOptional()
  @IsArray()
  approvedPartIds?: string[];

  @IsOptional()
  @IsArray()
  approvedServiceIds?: string[];
}

export class OperatorApproveRepairDto {
  @IsOptional()
  @IsArray()
  approvedFindingIds?: string[];

  @IsOptional()
  @IsArray()
  approvedPartIds?: string[];

  @IsOptional()
  @IsArray()
  approvedServiceIds?: string[];

  @IsOptional()
  @IsArray()
  approvedFindings?: any[];

  @IsOptional()
  @IsArray()
  approvedServices?: any[];

  @IsOptional()
  @IsString()
  operatorNote?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export interface OperatorRepairApprovalRecord {
  readonly workOrderId: string;
  approvedFindingIds: string[];
  approvedPartIds: string[];
  approvedServiceIds: string[];
  approvedAt: string;
  approvedByStaffId: string;
  operatorNote?: string;
  pricing: {
    partsTotal: number;
    laborTotal: number;
    grandTotal: number;
  };
}

export interface OperatorInspectionVehicleDto {
  id: string;
  plateNumber: string;
  model: string;
  vin: string;
}

export interface OperatorInspectionCustomerDto {
  id: string;
  name: string;
  phone: string;
}

export interface OperatorInspectionFindingDto {
  id?: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendedService?: string;
  code?: string;
}

export interface OperatorInspectionPartDto {
  inventoryItemId?: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OperatorInspectionServiceDto {
  id?: string;
  serviceName: string;
  laborPrice: number;
}

export interface OperatorPricingDto {
  partsTotal: number;
  laborTotal: number;
  grandTotal: number;
}

export class InspectionReportListItemDto {
  workOrderId!: string;
  vehicle!: OperatorInspectionVehicleDto;
  customer!: OperatorInspectionCustomerDto;
  status!: string;
  submittedAt!: string;
  findingsCount!: number;
  partsCount!: number;
  servicesCount!: number;
  totalEstimate!: number;
  inspectionId?: string | null;
  // Compatibility accessors:
  identifier?: string;
  vehicleModel?: string;
  vin?: string;
  customerName?: string;
  customerPhone?: string | null;
  pricing?: OperatorPricingDto;
  findings?: OperatorInspectionFindingDto[];
  parts?: OperatorInspectionPartDto[];
  services?: OperatorInspectionServiceDto[];
}

export class InspectionReportDetailDto {
  workOrderId!: string;
  status!: string;
  vehicle!: OperatorInspectionVehicleDto;
  customer!: OperatorInspectionCustomerDto;
  inspection!: {
    id?: string | null;
    submittedAt?: string;
    submittedBy?: string | null;
    note?: string;
    findings: OperatorInspectionFindingDto[];
    parts: OperatorInspectionPartDto[];
    services: OperatorInspectionServiceDto[];
    pricing: OperatorPricingDto;
  };
  // Compatibility accessors:
  identifier?: string;
  vehicleModel?: string;
  vin?: string;
  customerName?: string;
  customerPhone?: string | null;
  submittedAt?: string;
  findings?: OperatorInspectionFindingDto[];
  parts?: OperatorInspectionPartDto[];
  services?: OperatorInspectionServiceDto[];
  notes?: string;
  pricing?: OperatorPricingDto;
}
