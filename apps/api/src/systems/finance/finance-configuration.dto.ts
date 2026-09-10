import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min, ValidateIf } from "class-validator";

const PAYMENT_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "WALLET", "DEPOSIT"] as const;

export class UpdateFinanceConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountApprovalThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxBranchDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  depositRequired?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositPercent?: number;

  @IsOptional()
  @IsBoolean()
  technicianPriceVisible?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRatePercent?: number;

  @IsOptional()
  @IsBoolean()
  taxInclusive?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  invoiceNumberPrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultDueInDays?: number;

  @IsOptional()
  @IsBoolean()
  allowUnpaidDelivery?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPartialPaidDelivery?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(PAYMENT_METHODS, { each: true })
  paymentMethods?: (typeof PAYMENT_METHODS)[number][];

  @IsOptional()
  @IsString()
  invoiceTerms?: string;
}

export class SetPriceDto {
  @IsString()
  @Length(1, 120)
  itemKey!: string;

  @IsString()
  @Length(1, 40)
  itemType!: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborPrice?: number;

  /**
   * How long this job usually takes, in hours. Guidance for planning and for
   * what the technician sees on the card -- never a deadline, and nothing in
   * the product gates on it. Omit it to leave the workshop's existing estimate
   * alone; send null to clear it.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(999)
  standardHours?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
