import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

/**
 * The Owner History index query.
 *
 * A DTO rather than loose `@Query()` strings because the sort key is
 * interpolated into SQL downstream. The service keeps its own whitelist
 * -- that is the guarantee -- but a request that names a column which
 * does not exist should be refused at the door with a clear message
 * rather than silently falling back to the default sort, which reads as
 * "the sort button is broken".
 */
export class OwnerHistoryQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @IsIn(["all", "open", "closed"])
  activity?: "all" | "open" | "closed";

  @IsOptional()
  @IsIn(["lastVisit", "firstVisit", "visits", "customer", "plate", "outstanding"])
  sort?: "lastVisit" | "firstVisit" | "visits" | "customer" | "plate" | "outstanding";

  @IsOptional()
  @IsIn(["asc", "desc"])
  direction?: "asc" | "desc";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // Capped here as well as in the service. A page size of 10,000 is not a
  // preference, it is a way to turn a paginated index back into the giant
  // payload the pagination exists to prevent.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
