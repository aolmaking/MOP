import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { hashPassword } from "../../identity/auth/password.util";

export interface WorkshopContext {
  readonly tenantId: string;
  readonly tenantName: string;
}

export interface RegisterCustomerInput {
  readonly workshopCode: string;
  readonly fullName: string;
  readonly phone: string;
  readonly email?: string;
  readonly password: string;
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
      select: { id: true, name: true },
    });

    if (!tenant) throw this.notFound();
    return { tenantId: tenant.id, tenantName: tenant.name };
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

    // A phone match against an existing walk-in Customer (created by
    // Branch Manager's intake, no portal account yet) is the ordinary
    // case, not an error -- this is that same person creating their
    // portal login for the first time, and should CLAIM the existing
    // record so their real service history is theirs from day one,
    // rather than starting a second, empty Customer identity for the
    // same person (P-80, docs/POLICY_DECISION_INVENTORY.md §8.B). A
    // phone match against a Customer that already HAS an account is a
    // genuine conflict -- that phone is already registered.
    const phoneMatch = await this.prisma.customer.findFirst({
      where: { tenantId: workshop.tenantId, phone: input.phone },
      select: { id: true, accountId: true },
    });
    if (phoneMatch?.accountId) {
      throw new ConflictException({
        code: "phone_already_registered",
        message: "This phone number is already registered at this workshop. Try signing in instead.",
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
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

      if (phoneMatch) {
        // Guarded, not a plain update: two concurrent registrations
        // racing to claim the same walk-in record must not both
        // succeed (the second account would silently orphan itself with
        // no linked Customer). Only the transaction that observes
        // `accountId` still null wins.
        const claimed = await tx.customer.updateMany({
          where: { id: phoneMatch.id, accountId: null },
          data: { accountId: account.id, fullName: input.fullName, email: input.email ?? undefined, portalStatus: "ENABLED" },
        });
        if (claimed.count === 0) {
          throw new ConflictException({
            code: "phone_already_registered",
            message: "This phone number is already registered at this workshop. Try signing in instead.",
          });
        }
        return { id: phoneMatch.id };
      }

      const customer = await tx.customer.create({
        data: {
          tenantId: workshop.tenantId,
          accountId: account.id,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          // The account created just now IS the portal invite -- there is
          // no separate step to send, unlike a staff-created customer who
          // has to be invited afterward.
          portalStatus: "ENABLED",
        },
        select: { id: true },
      });

      return customer;
    });

    return { customerId: created.id, tenantName: workshop.tenantName };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "workshop_not_found",
      message: "We couldn't find a workshop with that code. Check it and try again.",
    });
  }
}
