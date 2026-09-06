import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

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

  // Mobile phone number -- accepts E.164 (+20...) or local (01...) format, normalized in service.
  @Matches(/^(\+|00)?[0-9\s\-()]{8,20}$/, { message: "phone must be a valid mobile phone number" })
  phone!: string;

  /** Car panel / plate number -- primary vehicle identity. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  plateNumber?: string;

  /** Optional alias for plateNumber. */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  carPlateNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(12, 200)
  password!: string;

  /** Affirmative response when prompted about linking an additional car to this phone number. */
  @IsOptional()
  @IsBoolean()
  confirmNewCar?: boolean;
}

