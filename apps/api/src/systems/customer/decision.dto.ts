import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsOptional, IsString, Length, Matches, ValidateNested } from "class-validator";

/**
 * Money arrives as a STRING and stays one all the way in -- same
 * discipline as `finance.dto.ts`'s own `MONEY` constant, duplicated
 * rather than imported because Customer and Finance are separate
 * bounded systems and neither imports the other's DTOs.
 */
const MONEY = /^-?\d+(\.\d{1,2})?$/;

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

/**
 * A technician's own request for the customer's approval -- what
 * `customer_decision.create` and `customer_decision.send` (both already
 * true by default for TECHNICIAN in `default-role-permissions.ts`, and
 * already named in `packages/shared/src/contracts/events.ts` as
 * `customer_decision.requested`/`.sent`) were declared for, before
 * anything actually called them.
 */
export class RaiseDecisionDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 1000)
  explanation!: string;

  @IsIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
  importance!: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  @Matches(MONEY, { message: "price must be a money value with at most 2 decimal places, as a string" })
  price!: string;

  @IsOptional()
  @Matches(MONEY, { message: "laborPrice must be a money value with at most 2 decimal places, as a string" })
  laborPrice?: string;
}
