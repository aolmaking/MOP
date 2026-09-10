import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
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

/**
 * The quote's own line shapes.
 *
 * These were `@IsArray()` over an inline TypeScript type, which validates the
 * ARRAY and nothing inside it -- so the type was documentation, not a contract.
 * That is how the operator page and the service ended up disagreeing about the
 * key holding a service's name without anything failing: the page wrote
 * `serviceName`, the service read `name`, and every dispatched task was titled
 * "Perform Vehicle Repair". Nested validation is what makes the shape real.
 */
export class QuoteFindingDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  partKey?: string;

  @IsString()
  description!: string;

  // The full four-value scale the database stores and the page sends. It used
  // to omit HIGH, so a HIGH finding was silently rewritten as MEDIUM on its way
  // in -- and CRITICAL was rewritten to HIGH further down, which made
  // SeverityLevel.CRITICAL unreachable and three policy options inert.
  @IsOptional()
  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  @IsOptional()
  @IsString()
  recommendedService?: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class QuotePartDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
  /**
   * Where the price on this line came from: the workshop's own catalogue, or a
   * figure submitted for a line no catalogue knows. Written by
   * `submitInspectionReport` and carried through the operator's approval so the
   * provenance of every quoted number survives to the approval record.
   */
  @IsOptional()
  @IsIn(["CATALOGUE", "SUBMITTED"])
  pricedFrom?: "CATALOGUE" | "SUBMITTED";
  /**
   * The finding this line was attached to on the technician's card.
   *
   * Carried through the approval so a partial approval means something: the
   * operator ticks findings, and the parts and labour that belong to the
   * unticked ones are neither dispatched nor charged.
   */
  @IsOptional()
  @IsString()
  findingCode?: string;
}

export class QuoteServiceDto {
  @IsOptional()
  @IsString()
  id?: string;

  /**
   * `serviceName`, not `name`.
   *
   * Both the technician's work card and the operator's quote builder write and
   * read this key, and both are the only writers of the JSON this ends up in.
   * The DTO and service were the outliers.
   */
  @IsString()
  serviceName!: string;

  @IsNumber()
  @Min(0)
  laborPrice!: number;
  /**
   * Where the price on this line came from: the workshop's own catalogue, or a
   * figure submitted for a line no catalogue knows. Written by
   * `submitInspectionReport` and carried through the operator's approval so the
   * provenance of every quoted number survives to the approval record.
   */
  @IsOptional()
  @IsIn(["CATALOGUE", "SUBMITTED"])
  pricedFrom?: "CATALOGUE" | "SUBMITTED";
  /**
   * The finding this line was attached to on the technician's card.
   *
   * Carried through the approval so a partial approval means something: the
   * operator ticks findings, and the parts and labour that belong to the
   * unticked ones are neither dispatched nor charged.
   */
  @IsOptional()
  @IsString()
  findingCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;
}

export class OperatorUpdateQuoteDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteFindingDto)
  findings?: QuoteFindingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotePartDto)
  parts?: QuotePartDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceDto)
  services?: QuoteServiceDto[];

  /**
   * `note`, singular.
   *
   * This was `notes`, and both pages send `note` -- so with the global pipe's
   * `forbidNonWhitelisted`, every Save Quote in the product returned
   * `400 property note should not exist`. The read path already returned
   * `fields.note`, so the plural was wrong at both ends.
   */
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * A repair the operator wants planned, as the page actually sends it.
 *
 * The DTO carried `tasksToCreate?: string[]` and the page sends
 * `tasks: [{ title, estimatedMinutes }]`, so with `forbidNonWhitelisted` every
 * Dispatch to Repair in the product returned
 * `400 property tasks should not exist`. `tasksToCreate` had no producer
 * anywhere -- not in the web app, not in a test -- so it is gone rather than
 * kept alongside.
 */
export class DispatchTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedMinutes?: number;
}

/**
 * What the operator approves off an inspection quote.
 *
 * One class, after `OperatorApproveRepairDto extends OperatorDispatchRepairDto
 * {}` -- an empty subclass -- was found sitting behind a second route that
 * called the same service method with the same permission and had no caller
 * anywhere. Two names for one contract is how two contracts eventually happen.
 */
export class OperatorApproveRepairDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  operatorNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchTaskDto)
  tasks?: DispatchTaskDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteFindingDto)
  approvedFindings?: QuoteFindingDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceDto)
  approvedServices?: QuoteServiceDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedFindingIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedPartIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedServiceIds?: string[];
}

/**
 * Approve and dispatch are the same request -- the controller routes both at
 * `OperatorService.approveRepair` -- so they take the same shape. Declared by
 * extension rather than duplicated, because the two drifting apart is exactly
 * how one of them ended up missing `tasks`.
 */
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
