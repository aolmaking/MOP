import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface CustomerMatch {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly vehicles: readonly VehicleMatch[];
}

export interface VehicleMatch {
  readonly id: string;
  readonly category: string;
  /** Plate or serial -- whichever identifies this thing to a human. */
  readonly identifier: string | null;
  readonly ownerCustomerId: string | null;
  readonly ownerName: string | null;
}

export interface IntakeLookupResult {
  readonly customers: readonly CustomerMatch[];
  /** Vehicles matched directly by plate/serial whose owner is not already in `customers`. */
  readonly vehicles: readonly VehicleMatch[];
}

/** Below this a search matches most of the workshop and helps nobody. */
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

/**
 * The one lookup behind intake's single search field.
 *
 * An advisor types whatever the customer just said -- a phone number, a
 * name, a plate -- and does not first classify it. So one query runs
 * against all three rather than making the advisor pick a search mode,
 * which is a decision the system can make for itself.
 *
 * Every query is bounded by tenant. Intake is not branch-scoped on the
 * read side on purpose: a customer who normally uses another branch is
 * still this workshop's customer, and forcing a duplicate record because
 * they walked into a different door is how one person becomes three.
 */
@Injectable()
export class IntakeLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async search(tenantId: string, rawQuery: string): Promise<IntakeLookupResult> {
    const query = rawQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) return { customers: [], vehicles: [] };

    const [customers, assets] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          tenantId,
          OR: [
            { phone: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          ownedAssets: {
            where: { endedAt: null },
            select: { asset: { select: ASSET_SUMMARY } },
          },
        },
        take: MAX_RESULTS,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.asset.findMany({
        where: {
          tenantId,
          OR: [
            { plateNumber: { contains: query, mode: "insensitive" } },
            { serialNumber: { contains: query, mode: "insensitive" } },
            { vinOrChassisNumber: { contains: query, mode: "insensitive" } },
          ],
        },
        // currentOwnerCustomerId is a plain column, not a relation, so the
        // owner's name is resolved in a second bounded query below rather
        // than by an include that does not exist.
        select: { ...ASSET_SUMMARY, currentOwnerCustomerId: true },
        take: MAX_RESULTS,
      }),
    ]);

    const ownerIds = [...new Set(assets.map((asset) => asset.currentOwnerCustomerId).filter(isPresent))];
    const owners = ownerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: ownerIds }, tenantId },
          select: { id: true, fullName: true },
        })
      : [];
    const ownerName = new Map(owners.map((owner) => [owner.id, owner.fullName]));

    const customerMatches: CustomerMatch[] = customers.map((customer) => ({
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      vehicles: customer.ownedAssets.map((owned) => ({
        id: owned.asset.id,
        category: owned.asset.category,
        identifier: owned.asset.plateNumber ?? owned.asset.serialNumber,
        ownerCustomerId: customer.id,
        ownerName: customer.fullName,
      })),
    }));

    // A vehicle whose owner already appears above would otherwise be
    // offered twice, in two shapes, as if they were different things.
    const alreadyListed = new Set(customerMatches.map((customer) => customer.id));

    const vehicleMatches: VehicleMatch[] = assets
      .filter((asset) => !asset.currentOwnerCustomerId || !alreadyListed.has(asset.currentOwnerCustomerId))
      .map((asset) => ({
        id: asset.id,
        category: asset.category,
        identifier: asset.plateNumber ?? asset.serialNumber,
        ownerCustomerId: asset.currentOwnerCustomerId,
        ownerName: asset.currentOwnerCustomerId ? (ownerName.get(asset.currentOwnerCustomerId) ?? null) : null,
      }));

    return { customers: customerMatches, vehicles: vehicleMatches };
  }
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

const ASSET_SUMMARY = {
  id: true,
  category: true,
  plateNumber: true,
  serialNumber: true,
} as const;
