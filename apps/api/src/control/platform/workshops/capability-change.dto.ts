import { Type } from "class-transformer";
import { ArrayMinSize, IsIn, IsString, Length, ValidateNested } from "class-validator";
import { CAPABILITY_KEYS, CAPABILITY_STATUSES } from "@mop/shared";

export class CapabilityChangeItemDto {
  @IsIn(CAPABILITY_KEYS as unknown as string[])
  capabilityKey!: (typeof CAPABILITY_KEYS)[number];

  @IsIn(CAPABILITY_STATUSES as unknown as string[])
  status!: (typeof CAPABILITY_STATUSES)[number];
}

export class CapabilityChangeDto {
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CapabilityChangeItemDto)
  changes!: CapabilityChangeItemDto[];
}

export class CapabilityApplyDto extends CapabilityChangeDto {
  /**
   * Required, and not defaulted. Reshaping a workshop is the single most
   * consequential thing the platform can do to a tenant, and the audit
   * entry is worthless without why.
   */
  @IsString()
  @Length(3, 500)
  reason!: string;
}
