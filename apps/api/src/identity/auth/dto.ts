import { IsString, Length, MinLength } from "class-validator";

export class LoginDto {
  /**
   * Email OR phone (E.164) -- per docs/detailed-specs/shared-system-pages.md,
   * the login page has one combined field, since Register as Customer
   * makes email optional and a phone-only customer must still be able to
   * sign back in. AuthService.login matches either; the exact shape
   * isn't validated here because an unrecognized string just fails to
   * match any account, same as a wrong password would.
   */
  @IsString()
  @Length(3, 254)
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

export class PasswordResetRequestDto {
  /**
   * Email OR phone, same as LoginDto. The endpoint deliberately returns
   * one response for found and not-found so it cannot enumerate accounts.
   */
  @IsString()
  @Length(3, 254)
  identifier!: string;
}

export class PasswordResetTokenDto {
  @IsString()
  @Length(16, 256)
  token!: string;
}

export class CompletePasswordResetDto extends PasswordResetTokenDto {
  @IsString()
  @Length(12, 200)
  password!: string;
}
