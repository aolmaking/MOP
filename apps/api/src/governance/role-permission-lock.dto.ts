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

  /**
   * Required, like setting one.
   *
   * Removing a lock hands a permission back to a workshop the platform
   * had deliberately taken it from -- audited at HIGH risk, and until now
   * with no explanation attached, so the record could show that access
   * was restored and never why. An asymmetric audit trail is the half
   * that gets questioned later.
   */
  @IsString()
  @Length(1, 500)
  reason!: string;
}
