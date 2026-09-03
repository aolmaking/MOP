import { IsOptional, IsString, Length } from "class-validator";

export class CreateBranchTaskDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  serviceKey?: string;

  @IsOptional()
  @IsString()
  assignToStaffUserId?: string;

  /**
   * The approved customer recommendation this task carries out, when it
   * carries one out. Optional, because most tasks are ordinary work that
   * was never a recommendation -- but supplying it is the only way the
   * history can later say this recommendation was PERFORMED rather than
   * "approved, no work linked".
   */
  @IsOptional()
  @IsString()
  decisionItemId?: string;
}
