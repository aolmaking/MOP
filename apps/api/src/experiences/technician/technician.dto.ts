import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
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

export class CartLineDto {
  @IsString()
  inventoryItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class SubmitCartDto {
  /**
   * Minted by the client when the cart is opened and sent unchanged with
   * every attempt, so a stalled submit that the technician taps again
   * lands on the same basket instead of a second one. Required rather
   * than optional: a duplicate part request is only ever noticed when
   * somebody counts the shelf.
   */
  @IsString()
  @Length(8, 64)
  cartKey!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  lines!: CartLineDto[];

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

export class RequestReturnDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ClarificationDto {
  @IsString()
  @Length(3, 1000)
  answer!: string;
}

export class ExternalPartDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsEnum(["CUSTOMER_SUPPLIED", "EXTERNAL_PURCHASE"] as const)
  provenance!: "CUSTOMER_SUPPLIED" | "EXTERNAL_PURCHASE";

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
