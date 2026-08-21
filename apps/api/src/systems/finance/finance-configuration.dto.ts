import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
