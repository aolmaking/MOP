import type { CapabilityProfile, OperatingCategory, ResponsibilityAnswer, WorkshopDraft } from "@mop/shared";
import type { CreateWorkshopDto } from "./create-workshop.dto";

/**
 * The request body, as the shape `validateDraft` understands.
 *
 * This exists so the server refuses a submission using *exactly* the
 * function the browser previewed it with. A second, server-side
 * reimplementation of "is this workshop coherent" would be two
 * implementations of one rule, and the one the user never sees is the
 * one that surprises them at the last press.
 *
 * The mapping is deliberately dumb -- no defaulting, no coercion beyond
 * shape. Anything that decides what a value *means* belongs in the
 * validator or the service, where it is tested.
 */
export function draftFromDto(dto: CreateWorkshopDto): WorkshopDraft {
  return {
    identity: {
      name: dto.name,
      slug: dto.slug,
      country: dto.country,
      city: dto.city,
      currency: dto.currency,
      timezone: dto.timezone,
      businessType: dto.businessType,
      businessTypeOther: dto.businessTypeOther,
      primaryCategory: dto.primaryCategory as OperatingCategory,
    },
    owner: {
      ownerFullName: dto.ownerFullName,
      ownerEmail: dto.ownerEmail,
      ownerPhone: dto.ownerPhone,
    },
    plan: {
      planId: dto.planId,
      initialStatus: dto.initialStatus,
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
