import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface CredentialDefinitionSummary {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
}

export interface StaffCredentialSummary {
  readonly id: string;
  readonly credentialDefinitionId: string;
  readonly name: string;
  readonly earnedAt: string;
  readonly expiresAt: string | null;
  readonly isExpired: boolean;
}

/**
 * A workshop-defined credential a technician can hold, with an optional
 * expiry. This phase settles the schema and proves grant/read; checking
 * a credential against a job requirement is follow-on work once Phase
 * 16/17 give a job something to declare its requirements against.
 */
@Injectable()
export class CredentialService {
  constructor(private readonly prisma: PrismaService) {}

  async define(tenantId: string, name: string, category?: string): Promise<CredentialDefinitionSummary> {
    const created = await this.prisma.credentialDefinition.create({
      data: { tenantId, name, category: category as never },
    });
    return { id: created.id, name: created.name, category: created.category };
  }

  async grant(
    tenantId: string,
    staffUserId: string,
    credentialDefinitionId: string,
    expiresAt?: Date,
  ): Promise<StaffCredentialSummary> {
    const definition = await this.prisma.credentialDefinition.findFirst({
      where: { id: credentialDefinitionId, tenantId },
    });
    if (!definition) {
      throw new NotFoundException({ code: "credential_not_found", message: "That credential does not exist." });
    }

    const granted = await this.prisma.staffCredential.create({
      data: { tenantId, staffUserId, credentialDefinitionId, expiresAt },
    });

    return this.toSummary(granted, definition.name);
  }

  async forTechnician(tenantId: string, staffUserId: string): Promise<readonly StaffCredentialSummary[]> {
    const rows = await this.prisma.staffCredential.findMany({
      where: { tenantId, staffUserId },
      include: { definition: true },
      orderBy: { earnedAt: "desc" },
    });

    return rows.map((row) => this.toSummary(row, row.definition.name));
  }

  private toSummary(
    row: { id: string; credentialDefinitionId: string; earnedAt: Date; expiresAt: Date | null },
    name: string,
  ): StaffCredentialSummary {
    return {
      id: row.id,
      credentialDefinitionId: row.credentialDefinitionId,
      name,
      earnedAt: row.earnedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      isExpired: row.expiresAt !== null && row.expiresAt.getTime() <= Date.now(),
    };
  }
}
