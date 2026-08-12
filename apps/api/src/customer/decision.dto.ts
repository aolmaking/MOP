import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsOptional, IsString, Length, ValidateNested } from "class-validator";

/**
 * The ONLY four fields a client may send about an item.
 *
 * There is deliberately no price, quantity, name or work order here. The
 * spec requires the server to *ignore* those rather than merely distrust
 * them, and the cleanest way to ignore a field is to have no place to put
 * it: with `forbidNonWhitelisted` on the global pipe, a modified client
 * that adds one gets a 400 rather than a silent drop.
 */
export class DecisionAnswerDto {
  @IsString()
  @Length(1, 64)
  itemId!: string;

  @IsIn(["APPROVED", "REJECTED"])
  decision!: "APPROVED" | "REJECTED";

  /**
   * Required in practice for a critical rejection, but optional here on
   * purpose: the server decides when it is mandatory, so the rule lives
   * in one place rather than being split between a DTO and a service.
   */
  @IsOptional()
  @IsBoolean()
  warningAcknowledged?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  note?: string;
}

export class RespondDto {
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => DecisionAnswerDto)
  answers!: DecisionAnswerDto[];
}
