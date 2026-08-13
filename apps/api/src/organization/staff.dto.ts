import { IsArray, IsEmail, IsIn, IsOptional, IsString, Length } from "class-validator";
import type { StaffRole } from "@mop/shared";

const INVITABLE_ROLES: StaffRole[] = [
  "TENANT_ADMIN",
  "BRANCH_MANAGER",
  "TECHNICIAN",
  "INVENTORY_MANAGER",
  "TEAM_LEADER",
  "DATA_ANALYST",
];

export class InviteStaffDto {
  @IsString()
  @Length(2, 100)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsIn(INVITABLE_ROLES)
  role!: StaffRole;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  branchScope?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  warehouseScope?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryScope?: string[];
}

export class UpdateStaffScopeDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  branchScope?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  warehouseScope?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryScope?: string[];
}
