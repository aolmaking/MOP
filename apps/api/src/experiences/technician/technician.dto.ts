import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
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

  /**
   * How long the diagnosis took, under the same TIME_TRACKING policy as a
   * task's. Diagnostic labour is labour, and a workshop that measures
   * repair time but not diagnosis time is measuring half its floor.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  /**
   * Answers to the workshop's own questions on this form.
   *
   * Validated against `CustomFieldDefinition` on the way in -- required-ness,
   * the option list on a SELECT and the category scope are all the server's
   * answer, not the page's. Typed loosely here because what a field accepts is
   * the owner's configuration rather than something a DTO can enumerate; the
   * shape check that matters happens against the definitions.
   */
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
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

  @IsOptional()
  @IsString()
  inspectionId?: string;
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

  @IsOptional()
  @IsString()
  inspectionId?: string;
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

export class CreateFaultDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  @IsEnum(SeverityLevel)
  severity!: SeverityLevel;

  /**
   * The workshop's own fault code, when it uses them.
   *
   * `Fault.code`, `Fault.recommendedService` and `Fault.inspectionId` are
   * all written by `TechnicianWorkService.createFault` and were all
   * unreachable: the service took them, the DTO did not offer them, so
   * the only fault a technician could actually record was a bare
   * description. The history module is what made that visible -- it
   * reports "what did the last technician recommend" from
   * `recommendedService`, and the column was empty for every fault in
   * the product.
   */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  code?: string;

  /** What the technician thinks should be done about it, in their words. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  recommendedService?: string;

  /** The inspection this came out of, so a finding can be read back beside it. */
  @IsOptional()
  @IsString()
  inspectionId?: string;
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

export class SubmitSpecializationEntryDto {
  @IsString()
  definitionId!: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  values!: Record<string, unknown>;
}

export class ToggleInspectionBoxDoneDto {
  @IsString()
  @Length(1, 64)
  partKey!: string;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsString()
  findingSeverity?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class SubmitInspectionReportDto {
  @IsOptional()
  @IsArray()
  findings?: Array<{
    id?: string;
    partKey?: string;
    description: string;
    severity?: "CRITICAL" | "MEDIUM" | "LOW";
    recommendedService?: string;
    code?: string;
  }>;

  @IsOptional()
  @IsArray()
  parts?: Array<{
    inventoryItemId?: string;
    name: string;
    sku?: string;
    quantity: number;
    /** Ignored when the workshop's catalogue knows the part -- the server prices it. */
    unitPrice?: number;
    /** Which finding this part belongs to, so a partial approval can be honoured. */
    findingCode?: string;
  }>;

  @IsOptional()
  @IsArray()
  /**
   * `serviceName`, not `name`.
   *
   * The technician's work card and the operator's quote builder both write and
   * read this key, and the stored JSON uses it -- this DTO and the service that
   * consumed it were the outliers, so every catalogue lookup was made against
   * `undefined` and every service on every report came back priced from the
   * browser instead of from the workshop's own catalogue.
   */
  services?: Array<{
    id?: string;
    serviceName: string;
    laborPrice?: number;
    hours?: number;
    /** Which finding this labour belongs to. */
    findingCode?: string;
  }>;

  @IsOptional()
  @IsString()
  note?: string;
}

export class InspectionTargetFindingItemDto {
  @IsString()
  findingKey!: string;

  @IsIn(["CRITICAL", "ATTENTION", "INFO"])
  severity!: "CRITICAL" | "ATTENTION" | "INFO";

  @IsOptional()
  @IsString()
  technicianObservation?: string;
}

export class PatchInspectionTargetDto {
  @IsString()
  canonicalPartSlug!: string;

  @IsString()
  position!: string;

  @IsIn(["INSPECTED", "NOT_ACCESSIBLE", "NOT_APPLICABLE"])
  status!: "INSPECTED" | "NOT_ACCESSIBLE" | "NOT_APPLICABLE";

  @IsOptional()
  @IsIn(["GOOD", "ATTENTION", "CRITICAL"])
  condition?: "GOOD" | "ATTENTION" | "CRITICAL";

  @IsOptional()
  @IsArray()
  findings?: InspectionTargetFindingItemDto[];

  @IsOptional()
  @IsString()
  nonInspectionReason?: string;

  @IsOptional()
  @IsString()
  technicianNote?: string;

  @IsOptional()
  measurementValue?: number | string;

  @IsOptional()
  @IsString()
  measurementUnit?: string;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

export class RecordRecommendationDecisionDto {
  @IsString()
  recommendationId!: string;

  @IsIn(["ACCEPTED", "DISMISSED", "MODIFIED_SCOPE"])
  decision!: "ACCEPTED" | "DISMISSED" | "MODIFIED_SCOPE";

  @IsOptional()
  @IsString()
  dismissalReason?: string;

  @IsOptional()
  @IsString()
  scopeModificationNote?: string;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

export class SubmitInspectionAggregateDto {
  @IsOptional()
  @IsInt()
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  submissionNote?: string;
}

