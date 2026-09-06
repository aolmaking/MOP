import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, Length, ValidateNested } from "class-validator";
import type { CapabilityProfile, OperatingCategory, ResponsibilityAnswer, WorkshopDraft } from "@mop/shared";
import { CreateWorkshopBranchDto, CreateWorkshopServiceDto, CreateWorkshopWarehouseDto } from "../create-workshop.dto";

/**
 * A draft on its way to being checked, not created.
 *
 * Deliberately far looser than `CreateWorkshopDto`. This endpoint is
 * called continuously while someone is still typing, so a half-filled
 * draft must reach the validator and come back with "the workshop still
 * needs a city" -- not be rejected by class-validator with a 400 that
 * says nothing a person can act on.
 *
 * So the shape is checked here and the *meaning* is checked by
 * `validateDraft`, which is the thing with the words in it. The strict
 * DTO still guards the actual creation endpoint, where a malformed body
 * is a bug rather than a work in progress.
 */
export class ValidateDraftDto {
  @IsOptional() @IsString() @Length(0, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 60) slug?: string;
  @IsOptional() @IsString() @Length(0, 60) country?: string;
  @IsOptional() @IsString() @Length(0, 80) city?: string;
  @IsOptional() @IsString() @Length(0, 8) currency?: string;
  @IsOptional() @IsString() @Length(0, 60) timezone?: string;
  @IsOptional() @IsString() @Length(0, 60) businessType?: string;
  @IsOptional() @IsString() @Length(0, 60) businessTypeOther?: string;
  @IsOptional() @IsString() @Length(0, 40) primaryCategory?: string;

  @IsOptional() @IsString() @Length(0, 120) ownerFullName?: string;
  @IsOptional() @IsString() @Length(0, 200) ownerEmail?: string;
  @IsOptional() @IsString() @Length(0, 24) ownerPhone?: string;

  @IsOptional() @IsString() @Length(0, 60) planId?: string;
  @IsOptional() @IsString() @Length(0, 40) initialStatus?: string;

  @IsOptional() @IsObject() capabilities?: Record<string, string>;
  @IsOptional() @IsObject() policies?: Record<string, string>;
  @IsOptional() @IsObject() responsibilities?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  specializationPacks?: string[];

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

export function draftFromValidateDto(dto: ValidateDraftDto): WorkshopDraft {
  return {
    identity: {
      name: dto.name ?? "",
      slug: dto.slug ?? "",
      country: dto.country ?? "",
      city: dto.city ?? "",
      currency: dto.currency ?? "",
      timezone: dto.timezone ?? "",
      businessType: dto.businessType ?? "",
      businessTypeOther: dto.businessTypeOther,
      primaryCategory: (dto.primaryCategory ?? "") as OperatingCategory | "",
    },
    owner: {
      ownerFullName: dto.ownerFullName ?? "",
      ownerEmail: dto.ownerEmail ?? "",
      ownerPhone: dto.ownerPhone ?? "",
    },
    plan: {
      planId: dto.planId ?? "",
      initialStatus: dto.initialStatus ?? "",
    },
    capabilities: (dto.capabilities ?? {}) as CapabilityProfile,
    specializationPacks: dto.specializationPacks ?? [],
    policies: dto.policies ?? {},
    responsibilities: (dto.responsibilities ?? {}) as Readonly<Record<string, ResponsibilityAnswer>>,
    branches: (dto.branches ?? []).map((branch) => ({
      name: branch.name,
      code: branch.code,
      city: branch.city,
      address: branch.address,
    })),
    warehouses: (dto.warehouses ?? []).map((warehouse) => ({
      name: warehouse.name,
      code: warehouse.code,
      branchCodes: warehouse.branchCodes ?? [],
    })),
    services: (dto.services ?? []).map((service) => ({
      name: service.name,
      price: service.price,
      category: service.category,
    })),
  };
}
