import { IsBoolean, IsString, Length } from "class-validator";

export class SetRoleLockDto {
  @IsString()
  role!: string;

  @IsString()
  permissionKey!: string;

  @IsBoolean()
  allowed!: boolean;

  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class RemoveRoleLockDto {
  @IsString()
  role!: string;

  @IsString()
  permissionKey!: string;
}
