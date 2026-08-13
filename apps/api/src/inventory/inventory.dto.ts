import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";

export class IssueDto {
  @IsString()
  warehouseId!: string;

  /**
   * May be less than what is outstanding. Partial issues are the point --
   * SCENARIOS.md 3.5 -- so this is not validated against the request here;
   * the service refuses an OVER-issue with a message naming both numbers.
   */
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReturnDto {
  @IsString()
  warehouseId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Damaged goes to its own bucket and never to sellable stock. A separate
   * flag rather than a separate endpoint, because the storekeeper decides
   * it while looking at the part in their hand.
   */
  @IsOptional()
  @IsBoolean()
  damaged?: boolean;
}

export class RejectReturnDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RequestClarificationDto {
  @IsString()
  @MinLength(1)
  question!: string;
}

/** H7/P-32: deactivating or reactivating a warehouse is structural enough to always require a stated reason, same as freeze/reactivate elsewhere in the product. */
export class WarehouseStatusDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
