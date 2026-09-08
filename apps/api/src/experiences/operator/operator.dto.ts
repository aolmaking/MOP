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
}
