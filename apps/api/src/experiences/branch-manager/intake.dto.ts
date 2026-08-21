import { Type } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString, Length, ValidateNested } from "class-validator";
import { CategoryCode } from "@mop/database";

/**
 * Either an existing customer is chosen, or a new one is described. The
 * controller rejects the case where neither is present -- expressing
 * "exactly one of these" through decorators alone reads worse than one
 * explicit check with a message an advisor can act on.
 */
export class IntakeCustomerDto {
  @IsOptional()
  @IsString()
  existingCustomerId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(4, 32)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(3, 160)
  email?: string;
}

export class IntakeAssetDto {
  @IsOptional()
  @IsString()
  existingAssetId?: string;

  @IsOptional()
  @IsEnum(CategoryCode)
  category?: CategoryCode;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  plateNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  vinOrChassisNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  serialNumber?: string;
}

export class IntakeDto {
  @IsString()
  branchId!: string;

  @ValidateNested()
  @Type(() => IntakeCustomerDto)
  customer!: IntakeCustomerDto;

  @ValidateNested()
  @Type(() => IntakeAssetDto)
  asset!: IntakeAssetDto;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  complaint?: string;

  /**
   * The customer refused inspection and asked for one named service.
   * Recorded here rather than inferred later, because "not inspected yet"
   * and "will not be inspected" are different states and only the second
   * may pass the Finish Gate without an inspection (SCENARIOS.md 1.2).
   */
  @IsOptional()
  @IsBoolean()
  inspectionDeclined?: boolean;

  /**
   * Set only after the advisor has been shown both names and confirmed
   * the vehicle really did change hands. Never defaulted true.
   */
  @IsOptional()
  @IsBoolean()
  confirmOwnershipTransfer?: boolean;

  /**
   * Set only after the advisor has been shown the existing customer at
   * this phone number and confirmed this is genuinely a different
   * person (e.g. a shared household phone). Never defaulted true.
   */
  @IsOptional()
  @IsBoolean()
  confirmNewCustomerDespitePhoneMatch?: boolean;
}
