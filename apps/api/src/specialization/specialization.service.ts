import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";

export type SpecializationKind = "SERVICE_CARD" | "MEASUREMENT_FORM";
export type SpecializationFieldType = "TEXT" | "DECIMAL" | "ENUM" | "BOOLEAN";

export interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly type: SpecializationFieldType;
  /** Only meaningful for MEASUREMENT_FORM points -- "bar", "volts", "mm". */
  readonly unit?: string;
  readonly enumOptions?: readonly string[];
  readonly required?: boolean;
}

export interface DefinitionSummary {
  readonly id: string;
  readonly category: string;
  readonly kind: SpecializationKind;
  readonly name: string;
  readonly version: number;
  readonly fields: readonly FieldSpec[];
}

export interface EntrySummary {
  readonly id: string;
  readonly definitionId: string;
  readonly definitionVersion: number;
  readonly values: Readonly<Record<string, unknown>>;
  readonly filledById: string;
  readonly filledAt: string;
}

/**
 * Service cards and measurement/diagnostic forms -- the two
 * specialization primitives this phase proves end-to-end. Both are the
 * same underlying shape (a named set of typed fields, filled in once per
 * work item), so one definition/entry pair covers both; `kind` exists
 * only to let a page ask for one or the other.
 *
 * The engine is this service; the shape is `fields`, authored data a
 * workshop owns, never a new Prisma model per service type -- the same
 * discipline the capability engine already applies to the workflow
 * graph.
 */
@Injectable()
export class SpecializationService {
  constructor(private readonly prisma: PrismaService) {}

  async defineCard(
    tenantId: string,
    category: string,
    kind: SpecializationKind,
    name: string,
    fields: readonly FieldSpec[],
    tx?: Prisma.TransactionClient,
  ): Promise<DefinitionSummary> {
    this.validateFieldSpecs(fields);

    const client = tx ?? this.prisma;
    const created = await client.specializationDefinition.create({
      data: {
        tenantId,
        category: category as never,
        kind: kind as never,
        name,
        version: 1,
        fields: fields as unknown as object,
      },
    });

    return this.toSummary(created);
  }

  /**
   * Editing a live definition's fields bumps the version rather than
   * mutating in place -- entries already filled against version 1 keep
   * meaning what they meant when they were filled, per this phase's own
   * open question about versioning.
   */
  async reviseFields(definitionId: string, fields: readonly FieldSpec[]): Promise<DefinitionSummary> {
    this.validateFieldSpecs(fields);

    const current = await this.prisma.specializationDefinition.findUnique({ where: { id: definitionId } });
    if (!current) throw new NotFoundException({ code: "definition_not_found", message: "That definition does not exist." });

    const updated = await this.prisma.specializationDefinition.update({
      where: { id: definitionId },
      data: { version: current.version + 1, fields: fields as unknown as object },
    });

    return this.toSummary(updated);
  }

  async listDefinitions(
    tenantId: string,
    category: string,
    kind: SpecializationKind,
  ): Promise<readonly DefinitionSummary[]> {
    const rows = await this.prisma.specializationDefinition.findMany({
      where: { tenantId, category: category as never, kind: kind as never, isActive: true },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /**
   * Fills one entry against the definition's CURRENT version and pins
   * that version onto the entry. Values are validated against the
   * definition's field list at write time -- required fields present,
   * each value's type matching its field's declared type, enum values
   * drawn from the declared options -- so a stored entry can be trusted
   * without re-validating it on every later read.
   */
  async fillEntry(
    tenantId: string,
    definitionId: string,
    filledById: string,
    values: Readonly<Record<string, unknown>>,
    target: { workOrderId?: string; taskId?: string } = {},
  ): Promise<EntrySummary> {
    const definition = await this.prisma.specializationDefinition.findFirst({
      where: { id: definitionId, tenantId, isActive: true },
    });
    if (!definition) {
      throw new NotFoundException({ code: "definition_not_found", message: "That card or form does not exist." });
    }

    const fields = definition.fields as unknown as FieldSpec[];
    this.validateValues(fields, values);

    const entry = await this.prisma.specializationEntry.create({
      data: {
        tenantId,
        definitionId,
        definitionVersion: definition.version,
        workOrderId: target.workOrderId,
        taskId: target.taskId,
        values: values as unknown as object,
        filledById,
      },
    });

    return this.toEntrySummary(entry);
  }

  async entriesFor(tenantId: string, workOrderId: string): Promise<readonly EntrySummary[]> {
    const rows = await this.prisma.specializationEntry.findMany({
      where: { tenantId, workOrderId },
      orderBy: { filledAt: "desc" },
    });
    return rows.map((row) => this.toEntrySummary(row));
  }

  // --- internals -----------------------------------------------------

  private validateFieldSpecs(fields: readonly FieldSpec[]): void {
    if (fields.length === 0) {
      throw new BadRequestException({ code: "no_fields", message: "A definition needs at least one field." });
    }
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.key)) {
        throw new BadRequestException({ code: "duplicate_field_key", message: `Field key "${field.key}" is repeated.` });
      }
      keys.add(field.key);
      if (field.type === "ENUM" && (!field.enumOptions || field.enumOptions.length === 0)) {
        throw new BadRequestException({
          code: "enum_missing_options",
          message: `Field "${field.key}" is type ENUM but declares no options.`,
        });
      }
    }
  }

  private validateValues(fields: readonly FieldSpec[], values: Readonly<Record<string, unknown>>): void {
    for (const field of fields) {
      const value = values[field.key];

      if (value === undefined || value === null) {
        if (field.required) {
          throw new BadRequestException({ code: "field_required", message: `"${field.label}" is required.` });
        }
        continue;
      }

      switch (field.type) {
        case "TEXT":
          if (typeof value !== "string") {
            throw new BadRequestException({ code: "field_type_mismatch", message: `"${field.label}" must be text.` });
          }
          break;
        case "DECIMAL":
          if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new BadRequestException({ code: "field_type_mismatch", message: `"${field.label}" must be a number.` });
          }
          break;
        case "BOOLEAN":
          if (typeof value !== "boolean") {
            throw new BadRequestException({ code: "field_type_mismatch", message: `"${field.label}" must be true or false.` });
          }
          break;
        case "ENUM":
          if (typeof value !== "string" || !field.enumOptions?.includes(value)) {
            throw new BadRequestException({
              code: "field_enum_invalid",
              message: `"${field.label}" must be one of: ${(field.enumOptions ?? []).join(", ")}.`,
            });
          }
          break;
      }
    }
  }

  private toSummary(row: {
    id: string;
    category: string;
    kind: string;
    name: string;
    version: number;
    fields: unknown;
  }): DefinitionSummary {
    return {
      id: row.id,
      category: row.category,
      kind: row.kind as SpecializationKind,
      name: row.name,
      version: row.version,
      fields: row.fields as unknown as FieldSpec[],
    };
  }

  private toEntrySummary(row: {
    id: string;
    definitionId: string;
    definitionVersion: number;
    values: unknown;
    filledById: string;
    filledAt: Date;
  }): EntrySummary {
    return {
      id: row.id,
      definitionId: row.definitionId,
      definitionVersion: row.definitionVersion,
      values: row.values as Record<string, unknown>,
      filledById: row.filledById,
      filledAt: row.filledAt.toISOString(),
    };
  }
}
