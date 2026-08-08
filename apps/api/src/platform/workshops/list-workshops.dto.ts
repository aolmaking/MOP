import { Transform, Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { TenantStatus } from "@mop/database";

const SORT_OPTIONS = ["last_activity_desc", "name_asc", "branch_count_desc", "user_count_desc", "created_desc"] as const;
const PAGE_SIZES = [25, 50, 100] as const;
// Prisma generates a real runtime const object alongside the TS enum type
// -- reusing it here means this list can never drift from the schema's
// actual TenantStatus values the way a hand-copied array could.
const TENANT_STATUSES = Object.values(TenantStatus);

/** Comma-separated query param (?status=ACTIVE,FROZEN) -> string[], the standard robust way to accept a multi-select filter without depending on Express's array-query-param parsing. */
function csv(): (params: { value: unknown }) => string[] | undefined {
  return ({ value }) => {
    if (typeof value !== "string" || value.length === 0) return undefined;
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  };
}

export class ListWorkshopsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES)
  pageSize: number = 25;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(csv())
  @IsArray()
  @IsIn(TENANT_STATUSES, { each: true })
  status?: TenantStatus[];

  @IsOptional()
  @Transform(csv())
  @IsArray()
  plan?: string[];

  @IsOptional()
  @Transform(csv())
  @IsArray()
  health?: string[];

  @IsOptional()
  @IsIn(SORT_OPTIONS)
  sort: (typeof SORT_OPTIONS)[number] = "last_activity_desc";
}
