import { Type } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";

const WINDOWS = [30, 90] as const;

export class UsageOverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn(WINDOWS)
  window: (typeof WINDOWS)[number] = 30;
}
