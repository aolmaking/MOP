import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsOptional, IsString, Length, ValidateNested } from "class-validator";
import { DecisionAnswerDto } from "../systems/customer/decision.dto";

/** P-18: a staff member recording a decision the customer gave verbally. */
export class RecordDecisionDto {
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => DecisionAnswerDto)
  answers!: DecisionAnswerDto[];

  /** Required only when this workshop's PORTAL_COUNTER_APPROVAL policy is ALLOWED_WITH_EVIDENCE -- the service, not this DTO, enforces that. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  evidenceReference?: string;
}
