import { IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from "class-validator";
import type { CategoryCode } from "@mop/database";

export class ReportCustomerIssueDto {
  /** Selected existing asset ID if the customer chose one of their registered vehicles. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  assetId?: string;

  /** Plate number if entering a new vehicle. */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  plateNumber?: string;

  /** VIN or Chassis number if entering a new vehicle. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  vinOrChassisNumber?: string;

  /** Vehicle category if entering a new vehicle. */
  @IsOptional()
  @IsIn(["CARS", "MOTORCYCLES", "HEAVY_EQUIPMENT"])
  category?: CategoryCode;

  /** Problem description or symptoms reported by the customer. */
  @IsString()
  @Length(3, 2000)
  complaint!: string;

  /** Optional branch ID if customer requested a specific branch. */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  preferredBranchId?: string;

  /** True if customer specifically declined standard inspection. */
  @IsOptional()
  @IsBoolean()
  inspectionDeclined?: boolean;

  /** Customer-selected subsystems to inspect (e.g. ['ac', 'brakes', 'engine']) */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inspectionParts?: string[];
}
