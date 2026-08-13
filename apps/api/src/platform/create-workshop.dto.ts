import { IsBoolean, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min, ValidateIf } from "class-validator";
import { CategoryCode } from "@mop/database";
import { BUSINESS_TYPES, INITIAL_STATUSES, STARTER_BUILDER_TEMPLATES, STARTER_SPECIALIZATION_PROFILES } from "@mop/shared";

/**
 * "Add Workshop Owner," per docs/detailed-specs/platform-super-admin.md.
 * No password field: the owner account is created INVITED with no
 * password at all (see PlatformService.createWorkshop) -- they set their
 * own via the invite link, per the spec's explicit "password is never set
 * here" rule.
 */
export class CreateWorkshopDto {
  @IsString()
  planId!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  // The spec's own pattern (docs/detailed-specs/platform-super-admin.md,
  // Section 1): lowercase letters, digits and hyphens only. This is the
  // actual enforcement of that pattern -- @Length alone accepted any
  // string in range, including RTL-override and zero-width characters,
  // which is exactly what H9 (docs/scenarios3/EDGE_CASE_REGISTER.md)
  // named as unverified: this slug becomes a public URL segment
  // (`/w/{slug}`) and this project is built for a primary Arabic market,
  // so a slug is one of the few fields a malicious or careless client
  // could use to smuggle a directionality override into a value that
  // gets echoed back into UI chrome.
  @IsString()
  @Length(2, 60)
  @Matches(/^[a-z0-9-]+$/, { message: "slug must contain only lowercase letters, digits and hyphens" })
  slug!: string;

  // customerRegistrationCode is NOT one of Section 1's fields per
  // platform-super-admin.md's own field table -- it's generated server-
  // side (see PlatformService.generateRegistrationCode), not something
  // the platform admin types in.

  @IsString()
  @Length(2, 60)
  country!: string;

  @IsString()
  @Length(2, 60)
  city!: string;

  @IsIn(BUSINESS_TYPES)
  businessType!: (typeof BUSINESS_TYPES)[number];

  @ValidateIf((dto: CreateWorkshopDto) => dto.businessType === "Other")
  @IsString()
  @Length(2, 60)
  businessTypeOther?: string;

  @IsEnum(CategoryCode)
  primaryCategory!: CategoryCode;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsString()
  timezone!: string;

  @IsString()
  @Length(2, 120)
  ownerFullName!: string;

  @IsEmail()
  ownerEmail!: string;

  // E.164: a leading "+", first digit 1-9, up to 15 digits total. A regex
  // rather than a phone-number-parsing library -- format validation is
  // all this needs, and a full library would be real, unused weight.
  @Matches(/^\+[1-9]\d{1,14}$/)
  ownerPhone!: string;

  // "Soft targets" per spec -- validated against the plan's ceilings at
  // submit time but not persisted to any column (real branches/users/
  // warehouses are created later, by the Owner, in Organization & Access).
  @IsInt()
  @Min(1)
  allowedBranchesStart!: number;

  @IsInt()
  @Min(1)
  allowedUsersStart!: number;

  @IsInt()
  @Min(0)
  allowedWarehousesStart!: number;

  @IsIn(STARTER_BUILDER_TEMPLATES)
  starterBuilderTemplate!: (typeof STARTER_BUILDER_TEMPLATES)[number];

  @IsOptional()
  @IsBoolean()
  enableDemoData?: boolean;

  @IsIn(INITIAL_STATUSES)
  initialStatus!: (typeof INITIAL_STATUSES)[number];

  // Phase 17.A -- optional, defaults to no starter specialization data.
  @IsOptional()
  @IsIn(STARTER_SPECIALIZATION_PROFILES)
  starterSpecializationProfile?: (typeof STARTER_SPECIALIZATION_PROFILES)[number];
}
