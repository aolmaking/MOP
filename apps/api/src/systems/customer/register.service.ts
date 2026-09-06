import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { normalizePhoneNumber } from "@mop/shared";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { hashPassword } from "../../identity/auth/password.util";

export interface WorkshopContext {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly code: string;
  readonly slug: string;
  readonly city?: string | null;
  readonly logoUrl?: string | null;
  readonly palette?: string;
}

export interface RegisterCustomerInput {
  readonly workshopCode: string;
  readonly fullName: string;
  readonly phone: string;
  readonly plateNumber?: string;
  readonly carPlateNumber?: string;
  readonly email?: string;
  readonly password: string;
  readonly confirmNewCar?: boolean;
}

export interface RegisterCustomerResult {
  readonly customerId: string;
  readonly tenantName: string;
}

/**
 * Register as Customer, per docs/detailed-specs/shared-system-pages.md.
 *
 * Two rules the spec is explicit about:
 *
 * **The code resolves before anything else is meaningful.** An
 * unresolvable code shows an inline error immediately, before the rest
 * of the form even enables -- `resolveWorkshop` is deliberately its own
 * call, made as soon as a code is typed, not folded into `register`'s
 * validation.
 *
 * **There is no floating customer account.** `register` cannot succeed
 * without a resolved `tenantId` -- structurally, since the DTO and this
 * service both require the code to resolve first.
 *
 * Does NOT log the person in on success, matching `InviteService.accept`'s
 * own precedent: registering and signing in are separate acts, and a
 * person should reach the login screen and use the password they just
 * chose, which is the moment it becomes memorable.
 */
@Injectable()
export class RegisterCustomerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matched against `Tenant.slug` OR `Tenant.customerRegistrationCode`,
   * per the spec. Case-insensitive on the code the customer typed
   * (matches `WorkshopsService`'s own case-insensitive slug lookups
   * elsewhere), since a customer copying a code off a printed receipt or
   * a QR-code follow-up link should not be tripped up by casing.
   */
  async resolveWorkshop(code: string): Promise<WorkshopContext> {
    const trimmed = code?.trim();
    if (!trimmed) throw this.notFound();

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ slug: trimmed.toLowerCase() }, { customerRegistrationCode: { equals: trimmed, mode: "insensitive" } }],
        status: { notIn: ["FROZEN", "SUSPENDED", "ARCHIVED"] },
      },
      select: {
        id: true,
        name: true,
        customerRegistrationCode: true,
        slug: true,
        city: true,
        configuration: {
          select: { theme: true },
        },
      },
    });

    if (!tenant) throw this.notFound();
    const themeConfig = tenant.configuration?.theme as any;
    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      code: tenant.customerRegistrationCode,
      slug: tenant.slug,
      city: tenant.city,
      logoUrl: themeConfig?.logoUrl ?? null,
      palette: themeConfig?.palette ?? "crimson",
    };
  }

  async register(input: RegisterCustomerInput): Promise<RegisterCustomerResult> {
    const workshop = await this.resolveWorkshop(input.workshopCode);

    if (input.email) {
      // Platform-wide, matching every other account-creation path in this
      // product (Add Workshop Owner, Invite) -- an email is one Account,
      // ever, not just unique per tenant.
      const existing = await this.prisma.account.findFirst({ where: { email: input.email } });
      if (existing) {
        throw new ConflictException({
          code: "email_taken",
          message: "This email is already associated with an account.",
        });
      }
    }

    if (input.password.length < 12) {
      throw new BadRequestException({
        code: "password_too_short",
        message: "Choose a password of at least 12 characters.",
      });
    }

    const rawPlate = (input.plateNumber || input.carPlateNumber || "").trim();
    const normalizedPlate = rawPlate.toUpperCase();
    const normalizedPhone = normalizePhoneNumber(input.phone) || input.phone.trim();

    // Check if phone matches an existing Customer in this workshop
    const phoneMatch = await this.prisma.customer.findFirst({
      where: {
        tenantId: workshop.tenantId,
        OR: [{ phone: input.phone.trim() }, { phone: normalizedPhone }],
      },
      select: { id: true, accountId: true, fullName: true },
    });

    const existingAssets = phoneMatch
      ? await this.prisma.asset.findMany({
          where: {
            tenantId: workshop.tenantId,
            OR: [
              { currentOwnerCustomerId: phoneMatch.id },
              { ownershipHistory: { some: { customerId: phoneMatch.id, endedAt: null } } },
            ],
          },
          select: { id: true, plateNumber: true },
        })
      : [];

    const existingPlates = existingAssets.map((a) => a.plateNumber).filter((p): p is string => Boolean(p));
    const plateAlreadyOwned = rawPlate.length > 0 && existingAssets.some(
      (a) => (a.plateNumber || "").trim().toUpperCase() === normalizedPlate,
    );

    // If customer already exists and has cars registered, check if the plate is different
    if (phoneMatch && existingAssets.length > 0 && !plateAlreadyOwned && rawPlate.length > 0) {
      if (!input.confirmNewCar) {
        throw new ConflictException({
          code: "different_car_detected",
          message:
            "This number is already signed in before and the car panel number is different. Is this a new car under your name?",
          details: {
            existingPlates,
            newPlate: rawPlate,
          },
        });
      }

      // User confirmed YES (confirmNewCar === true) -- connect customer with BOTH cars!
      const customerId = phoneMatch.id;
      await this.prisma.$transaction(async (tx) => {
        // If account not created yet, create it and link
        if (!phoneMatch.accountId) {
          const account = await tx.account.create({
            data: {
              accountType: "CUSTOMER",
              tenantId: workshop.tenantId,
              email: input.email,
              phone: input.phone,
              passwordHash: hashPassword(input.password),
              status: "ACTIVE",
            },
          });
          await tx.customer.update({
            where: { id: customerId },
            data: {
              accountId: account.id,
              fullName: input.fullName || phoneMatch.fullName,
              email: input.email ?? undefined,
              portalStatus: "ENABLED",
            },
          });
        }

        // Link the new vehicle to this customer as well
        await this.linkVehicle(tx, workshop.tenantId, customerId, rawPlate);
      });

      return { customerId, tenantName: workshop.tenantName };
    }

    // Phone match where same car or no new car conflict
    if (phoneMatch?.accountId && (!rawPlate || plateAlreadyOwned)) {
      throw new ConflictException({
        code: "phone_already_registered",
        message: "This phone number is already registered at this workshop. Try signing in instead.",
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (phoneMatch) {
        // Walk-in claiming their account for the first time
        const account = await tx.account.create({
          data: {
            accountType: "CUSTOMER",
            tenantId: workshop.tenantId,
            email: input.email,
            phone: normalizedPhone,
            passwordHash: hashPassword(input.password),
            status: "ACTIVE",
          },
        });

        const claimed = await tx.customer.updateMany({
          where: { id: phoneMatch.id, accountId: null },
          data: { accountId: account.id, fullName: input.fullName, email: input.email ?? undefined, phone: normalizedPhone, portalStatus: "ENABLED" },
        });

        if (claimed.count === 0) {
          throw new ConflictException({
            code: "phone_already_registered",
            message: "This phone number is already registered at this workshop. Try signing in instead.",
          });
        }

        if (rawPlate) {
          await this.linkVehicle(tx, workshop.tenantId, phoneMatch.id, rawPlate);
        }

        return { id: phoneMatch.id };
      }

      // Brand new Customer + Account
      const account = await tx.account.create({
        data: {
          accountType: "CUSTOMER",
          tenantId: workshop.tenantId,
          email: input.email,
          phone: normalizedPhone,
          passwordHash: hashPassword(input.password),
          status: "ACTIVE",
        },
      });

      const customer = await tx.customer.create({
        data: {
          tenantId: workshop.tenantId,
          accountId: account.id,
          fullName: input.fullName,
          phone: normalizedPhone,
          email: input.email,
          portalStatus: "ENABLED",
        },
        select: { id: true },
      });

      if (rawPlate) {
        await this.linkVehicle(tx, workshop.tenantId, customer.id, rawPlate);
      }

      return customer;
    });

    return { customerId: created.id, tenantName: workshop.tenantName };
  }

  private async linkVehicle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    customerId: string,
    plateNumber: string,
  ) {
    let asset = await tx.asset.findFirst({
      where: { tenantId, plateNumber: { equals: plateNumber, mode: "insensitive" } },
    });

    if (!asset) {
      asset = await tx.asset.create({
        data: {
          tenantId,
          category: "CARS",
          plateNumber,
          currentOwnerCustomerId: customerId,
        },
      });
    } else if (!asset.currentOwnerCustomerId) {
      await tx.asset.update({
        where: { id: asset.id },
        data: { currentOwnerCustomerId: customerId },
      });
    }

    const existingOwnership = await tx.assetOwnershipHistory.findFirst({
      where: { assetId: asset.id, customerId, endedAt: null },
    });

    if (!existingOwnership) {
      await tx.assetOwnershipHistory.create({
        data: {
          tenantId,
          assetId: asset.id,
          customerId,
          startedAt: new Date(),
        },
      });
    }

    return asset;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "workshop_not_found",
      message: "We couldn't find a workshop with that code. Check it and try again.",
    });
  }
}

