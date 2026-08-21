import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

/**
 * Register as Customer, per docs/detailed-specs/shared-system-pages.md.
 * The only public self-registration path in the whole product -- no
 * role, no owner/staff option, exactly one outcome (a CUSTOMER account
 * scoped to the resolved tenant).
 */
export class RegisterCustomerDto {
  /** Matched against Tenant.slug or Tenant.customerRegistrationCode -- the service decides which, this DTO doesn't care. */
  @IsString()
  @Length(2, 60)
  workshopCode!: string;

  @IsString()
  @Length(2, 100)
  fullName!: string;

  // E.164, same pattern CreateWorkshopDto already uses for ownerPhone.
  @Matches(/^\+[1-9]\d{1,14}$/)
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(12, 200)
  password!: string;
}
