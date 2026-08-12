import { IsEmail, IsString, Length, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class InviteTokenDto {
  @IsString()
  @Length(16, 256)
  token!: string;
}

export class AcceptInviteDto extends InviteTokenDto {
  /**
   * Twelve minimum, matching the seeded accounts' own standard. A
   * workshop owner is the highest-privilege account in a tenant, and this
   * is the one moment their password is chosen.
   */
  @IsString()
  @Length(12, 200)
  password!: string;
}
