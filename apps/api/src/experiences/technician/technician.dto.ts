import { IsEnum, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { BlockerReason, InspectionType, SeverityLevel } from "@mop/database";

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

export class CompleteTaskDto {
  /** TIME_TRACKING's own field. Absent under OFF/OPTIONAL is fine; REQUIRED refuses without it. */
  @IsOptional()
  @IsInt()
  @Min(0)
  minutesSpent?: number;
}

export class RecordInspectionDto {
  @IsEnum(InspectionType)
  type!: InspectionType;

  @IsOptional()
  @IsInt()
  @Min(0)
  odometerOrHours?: number;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
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

export class ReturnPartDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class RespondToClarificationDto {
  @IsString()
  @Length(1, 1000)
  response!: string;
}

export class CreateFaultDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  @IsEnum(SeverityLevel)
  severity!: SeverityLevel;
}
