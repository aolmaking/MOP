import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { ENTITLEMENT_FIELDS, type EntitlementField } from "../entitlements/tenant-entitlements.service";

export class SetEntitlementOverrideDto {
  @IsIn(ENTITLEMENT_FIELDS)
  field!: EntitlementField;

  @IsOptional()
  @IsInt()
  @Min(0)
  numericValue?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stringValues?: string[];

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ClearEntitlementOverrideDto {
  @IsIn(ENTITLEMENT_FIELDS)
  field!: EntitlementField;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
