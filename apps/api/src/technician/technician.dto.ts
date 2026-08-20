import { IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { BlockerReason, SeverityLevel } from "@mop/database";

export class ReportBlockerDto {
  @IsEnum(BlockerReason)
  reason!: BlockerReason;

  /**
   * Optional, because a technician standing at a car with one free hand
   * should be able to raise a blocker in one tap. The reason enum already
   * routes it; the note only adds detail.
   */
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;
}

export class RequestPartDto {
  @IsString()
  inventoryItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class CreateFaultDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  @IsEnum(SeverityLevel)
  severity!: SeverityLevel;
}
