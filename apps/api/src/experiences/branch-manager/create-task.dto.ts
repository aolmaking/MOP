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
}
