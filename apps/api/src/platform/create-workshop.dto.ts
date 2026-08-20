import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CategoryCode } from "@mop/database";
import {
  BUSINESS_TYPES,
  CAPABILITY_KEYS,
  CAPABILITY_STATUSES,
  INITIAL_STATUSES,
  SPECIALIZATION_PACK_KEYS,
  STARTER_BUILDER_TEMPLATES,
  STARTER_SPECIALIZATION_PROFILES,
} from "@mop/shared";
import type { CapabilityKey, CapabilityStatus } from "@mop/shared";

/**
 * A branch the workshop trades from, declared at creation.
 *
 * PHASE_17.md 17.B: "a multi-branch workshop declares its branches during
 * creation, not by direct database access afterwards." Scenario 6 recorded
 * a real 4-branch onboarding done partly through SQL because nothing in
 * the product handled structure at creation time.
 */
export class CreateWorkshopBranchDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  // Same shape the Branch model's @@unique([tenantId, code]) is built
  // around, and the same character class the slug uses for the same
  // reason -- a code is echoed into UI chrome and must not be able to
  // carry a directionality override.
  @IsString()
  @Matches(/^[A-Z0-9-]{1,12}$/, { message: "code must be up to 12 capitals, digits or hyphens" })
  code!: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  address?: string;
}

/**
 * A priced service the workshop starts with.
 *
 * Written as a real `PriceCatalogEntry` -- the same table the running
 * invoice resolves a line's price from -- so a service declared here can
 * be charged on the workshop's first job. Deliberately not an
 * onboarding-only list.
 */
export class CreateWorkshopServiceDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  /**
   * Minor units, as a string. Money crosses every API boundary in MOP as
   * text and never as a JS number -- a float here would be a rounding
   * error with a customer's invoice on the other end of it.
   */
  @IsString()
  @Matches(/^\d{1,12}$/, { message: "price must be a whole number of minor units, as a string" })
  price!: string;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  category?: string;
}

export class CreateWorkshopWarehouseDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9-]{1,12}$/, { message: "code must be up to 12 capitals, digits or hyphens" })
  code!: string;

  /** Branch codes this store serves. Empty grants it to every branch. */
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  branchCodes!: string[];
}

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

  // Phase 17.A's original two-profile field. Kept so an existing caller
  // (and the integration tests written against it) still works, and so
  // the change to `specializationPacks` below is additive rather than a
  // breaking rename. A request may send either; both are seeded.
  @IsOptional()
  @IsIn(STARTER_SPECIALIZATION_PROFILES)
  starterSpecializationProfile?: (typeof STARTER_SPECIALIZATION_PROFILES)[number];

  // -----------------------------------------------------------------
  // The workshop's actual shape
  //
  // Everything below was absent until now, which meant every workshop
  // this product ever created was implicitly the full twelve-capability
  // product with no policies and no structure -- the capability engine's
  // seven shipped profiles were documented as "Super Admin applies one at
  // creation" and wired to nothing.
  // -----------------------------------------------------------------

  /**
   * Deviations from the full product, as capabilityKey -> status. An
   * absent key means ENABLED, matching the engine's own convention: a
   * profile records what this workshop does NOT have.
   *
   * Validated structurally here and semantically in the service, which
   * runs the reachability validator before anything is written -- a
   * profile that could strand a work order is refused, not created.
   */
  @IsOptional()
  @IsObject()
  capabilities?: Partial<Record<CapabilityKey, CapabilityStatus>>;

  /** Policy key -> chosen option key. An absent key runs on the registry default. */
  @IsOptional()
  @IsObject()
  policies?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(SPECIALIZATION_PACK_KEYS, { each: true })
  @ArrayMaxSize(20)
  specializationPacks?: string[];

  /**
   * Capability key -> the role that operates it, or "DEDICATED" to staff
   * the role the platform's baseline map already gives the work to.
   *
   * This closes a real hole: `TENANT_OWNER` holds no `inventory.*`
   * permission, so a workshop with Inventory on and no storekeeper had
   * part requests nobody on earth could approve.
   */
  @IsOptional()
  @IsObject()
  responsibilities?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkshopBranchDto)
  @ArrayMaxSize(200)
  branches?: CreateWorkshopBranchDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkshopWarehouseDto)
  @ArrayMaxSize(200)
  warehouses?: CreateWorkshopWarehouseDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateWorkshopServiceDto)
  @ArrayMaxSize(200)
  services?: CreateWorkshopServiceDto[];
}

/** Runtime guards for the two free-shape maps above, used by the service. */
export const KNOWN_CAPABILITY_KEYS: ReadonlySet<string> = new Set(CAPABILITY_KEYS);
export const KNOWN_CAPABILITY_STATUSES: ReadonlySet<string> = new Set(CAPABILITY_STATUSES);
