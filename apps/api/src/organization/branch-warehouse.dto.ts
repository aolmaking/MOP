import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class CreateBranchDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  address?: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  city?: string;
}

export class CreateWarehouseDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  code?: string;
}

export class SetLinkDto {
  @IsString()
  branchId!: string;

  @IsString()
  warehouseId!: string;

  @IsBoolean()
  linked!: boolean;
}
