import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CategoryCode } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { CUSTOM_FIELD_TYPES, FORM_REGISTRY, slugifyFieldKey, type CustomFieldType, type FormKey } from "./form-registry";

export interface FormsActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface CustomFieldView {
  readonly id: string;
  readonly fieldKey: string;
  readonly label: string;
  readonly fieldType: CustomFieldType;
  readonly options: readonly { key: string; label: string }[] | null;
  readonly categoryScope: readonly string[];
  readonly roleScope: readonly string[];
  readonly customerVisible: boolean;
  readonly reportable: boolean;
  readonly required: boolean;
  readonly order: number;
  readonly isArchived: boolean;
}

export interface FormFieldsView {
  readonly key: FormKey;
  readonly label: string;
  readonly coreFields: readonly string[];
  readonly customFields: readonly CustomFieldView[];
}

export interface AddFieldInput {
  readonly label: string;
  readonly fieldType: CustomFieldType;
  readonly options?: readonly { key: string; label: string }[];
  readonly categoryScope?: readonly string[];
  readonly roleScope?: readonly string[];
  readonly customerVisible?: boolean;
  readonly reportable?: boolean;
  readonly required?: boolean;
}

/**
 * Forms & Fields -- the definition/authoring half of the chain
 * (Inspection.fields JSON -> custom-field definition -> validation ->
 * persistence -> API -> rendering/editing -> reporting implications).
 *
 * `validateValues` is the validation link any consumer calls before
 * writing into a form's JSON bucket -- e.g. TechnicianWorkService's
 * `recordInspection`, whose `fields` input is already documented as
 * "shaped by the tenant's form configuration" (it long predates this
 * service; this is that configuration, finally built). No consuming UI
 * for Quick/Full Inspection exists yet in the product (there is no
 * inspection-recording page at all), so this method is exercised here
 * by its own tests, ready for that page the moment it is built --
 * the same "never a hardcoded fallback" discipline Messages & Templates
 * needed applies here too: nothing should ever validate against an
 * inline, duplicated copy of a field list instead of this table.
 */
@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, formKey: FormKey): Promise<FormFieldsView> {
    const def = FORM_REGISTRY[formKey];
    const rows = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId, formKey },
      orderBy: { order: "asc" },
    });

    return {
      key: formKey,
      label: def.label,
      coreFields: def.coreFields,
      customFields: rows.map((r) => this.toView(r)),
    };
  }

  async addField(tenantId: string, formKey: FormKey, input: AddFieldInput, actor: FormsActor): Promise<CustomFieldView> {
    const label = input.label.trim();
    if (!label) throw new BadRequestException({ code: "label_required", message: "A field needs a name." });
    if (!CUSTOM_FIELD_TYPES.includes(input.fieldType)) {
      throw new BadRequestException({ code: "invalid_field_type", message: "Unrecognized field type." });
    }
    if (input.fieldType === "SELECT" && (!input.options || input.options.length === 0)) {
      throw new BadRequestException({ code: "options_required", message: "A select field needs at least one option." });
    }

    const fieldKey = slugifyFieldKey(label);
    if (!fieldKey) throw new BadRequestException({ code: "label_required", message: "A field needs a name." });

    const clash = await this.prisma.customFieldDefinition.findUnique({
      where: { tenantId_formKey_fieldKey: { tenantId, formKey, fieldKey } },
    });
    if (clash) {
      throw new ConflictException({
        code: "field_key_taken",
        message: clash.isArchived
          ? "A field with this name was archived on this form. Restore it instead of creating a duplicate."
          : "This form already has a field by that name.",
      });
    }

    const maxOrder = await this.prisma.customFieldDefinition.aggregate({
      where: { tenantId, formKey },
      _max: { order: true },
    });

    const row = await this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        formKey,
        fieldKey,
        label,
        fieldType: input.fieldType,
        options: input.options ? (input.options as never) : undefined,
        categoryScope: (input.categoryScope ?? []) as CategoryCode[],
        roleScope: [...(input.roleScope ?? [])],
        customerVisible: input.customerVisible ?? false,
        reportable: input.reportable ?? false,
        required: input.required ?? false,
        order: (maxOrder._max.order ?? 0) + 1,
        createdById: actor.accountId,
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "CustomFieldDefinition",
      targetId: row.id,
      action: "custom_field.added",
      after: { formKey, fieldKey, label, fieldType: input.fieldType },
      riskLevel: "LOW",
    });

    return this.toView(row);
  }

  async setArchived(tenantId: string, fieldId: string, archived: boolean, actor: FormsActor): Promise<void> {
    const field = await this.prisma.customFieldDefinition.findFirst({ where: { id: fieldId, tenantId } });
    if (!field) throw new NotFoundException({ code: "field_not_found", message: "That field was not found." });
    if (field.isArchived === archived) return;

    await this.prisma.customFieldDefinition.update({ where: { id: fieldId }, data: { isArchived: archived } });

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "CustomFieldDefinition",
      targetId: fieldId,
      action: archived ? "custom_field.archived" : "custom_field.restored",
      before: { isArchived: field.isArchived },
      after: { isArchived: archived },
      riskLevel: "LOW",
    });
  }

  /**
   * The validation link in the chain. Checks every *live* (non-archived)
   * field for this form/category: required fields present, SELECT values
   * are one of the defined options, no unknown keys. Returns the subset
   * of `values` that should actually be persisted (unknown keys dropped
   * rather than silently stored forever in the JSON blob).
   */
  async validateValues(
    tenantId: string,
    formKey: FormKey,
    category: CategoryCode | null,
    values: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const live = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId, formKey, isArchived: false },
    });

    const applicable = live.filter((f) => f.categoryScope.length === 0 || (category !== null && f.categoryScope.includes(category)));

    const result: Record<string, unknown> = {};
    for (const field of applicable) {
      const value = values[field.fieldKey];

      if (value === undefined || value === null || value === "") {
        if (field.required) {
          throw new BadRequestException({
            code: "field_required",
            message: `"${field.label}" is required.`,
            details: { fieldKey: field.fieldKey },
          });
        }
        continue;
      }

      if (field.fieldType === "SELECT") {
        const options = (field.options as { key: string }[] | null) ?? [];
        if (!options.some((o) => o.key === value)) {
          throw new BadRequestException({
            code: "invalid_field_value",
            message: `"${value}" is not a valid option for "${field.label}".`,
            details: { fieldKey: field.fieldKey },
          });
        }
      }

      if (field.fieldType === "NUMBER" && typeof value !== "number") {
        throw new BadRequestException({
          code: "invalid_field_value",
          message: `"${field.label}" must be a number.`,
          details: { fieldKey: field.fieldKey },
        });
      }

      result[field.fieldKey] = value;
    }

    return result;
  }

  private toView(row: {
    id: string;
    fieldKey: string;
    label: string;
    fieldType: string;
    options: unknown;
    categoryScope: string[];
    roleScope: string[];
    customerVisible: boolean;
    reportable: boolean;
    required: boolean;
    order: number;
    isArchived: boolean;
  }): CustomFieldView {
    return {
      id: row.id,
      fieldKey: row.fieldKey,
      label: row.label,
      fieldType: row.fieldType as CustomFieldType,
      options: (row.options as { key: string; label: string }[] | null) ?? null,
      categoryScope: row.categoryScope,
      roleScope: row.roleScope,
      customerVisible: row.customerVisible,
      reportable: row.reportable,
      required: row.required,
      order: row.order,
      isArchived: row.isArchived,
    };
  }
}
