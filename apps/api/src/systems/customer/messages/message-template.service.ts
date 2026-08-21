import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { AuditService } from "../../../audit/audit.service";
import {
  MESSAGE_TEMPLATE_REGISTRY,
  firstMissingRequiredVariable,
  renderTemplate,
  type MessageTemplateKey,
} from "./message-template-registry";

export interface MessagesActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface TemplateView {
  readonly key: MessageTemplateKey;
  readonly label: string;
  readonly requiredVariables: readonly string[];
  readonly availableVariables: readonly string[];
  /** Null if this workshop has never published one -- see PLATFORM_DEFAULT_BODY. */
  readonly body: string;
  readonly version: number;
  readonly publishedAt: string;
  readonly isPublished: boolean;
}

/**
 * "Never a hardcoded fallback anywhere in that code path" (spec) means
 * every consumer must be able to get *some* real, non-placeholder body
 * even before an Owner has ever opened this page -- otherwise the first
 * real send has nothing to read. This is that floor, defined once, here,
 * not duplicated as a hardcoded string inside whatever eventually sends
 * WhatsApp messages.
 */
const PLATFORM_DEFAULT_BODY: Readonly<Record<MessageTemplateKey, string>> = {
  WHATSAPP_DECISION:
    "Hi {{customer_name}}, {{branch_name}} needs your approval on work order {{work_order_id}}. Review and respond here: {{decision_link}}",
  APPROVAL_REQUEST: "Hi {{customer_name}}, {{branch_name}} is requesting your approval on work order {{work_order_id}}.",
  WAITING_PARTS: "Hi {{customer_name}}, work order {{work_order_id}} at {{branch_name}} is waiting on a part to arrive.",
  READY_FOR_DELIVERY: "Hi {{customer_name}}, your vehicle is ready for pickup at {{branch_name}} (work order {{work_order_id}}).",
  PAYMENT_PENDING: "Hi {{customer_name}}, work order {{work_order_id}} at {{branch_name}} has a balance of {{total_amount}} due.",
  CRITICAL_WARNING: "Hi {{customer_name}}, {{branch_name}} found a critical issue on work order {{work_order_id}} that needs your attention.",
  INVOICE_MESSAGE: "Hi {{customer_name}}, your invoice for work order {{work_order_id}} at {{branch_name}} totals {{total_amount}}.",
  REMINDER: "Hi {{customer_name}}, this is a reminder about work order {{work_order_id}} at {{branch_name}}.",
};

@Injectable()
export class MessageTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string): Promise<TemplateView[]> {
    const rows = await this.currentRows(tenantId);
    const byKey = new Map(rows.map((r) => [r.templateKey as MessageTemplateKey, r]));

    return (Object.keys(MESSAGE_TEMPLATE_REGISTRY) as MessageTemplateKey[]).map((key) => {
      const def = MESSAGE_TEMPLATE_REGISTRY[key];
      const current = byKey.get(key);
      return {
        key,
        label: def.label,
        requiredVariables: def.requiredVariables,
        availableVariables: def.availableVariables,
        body: current?.body ?? PLATFORM_DEFAULT_BODY[key],
        version: current?.version ?? 0,
        publishedAt: (current?.publishedAt ?? new Date(0)).toISOString(),
        isPublished: current !== undefined,
      };
    });
  }

  /** The exact body any real sender must read -- current published version, or the platform default. */
  async currentBody(tenantId: string, key: MessageTemplateKey): Promise<{ body: string; version: number }> {
    const current = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, templateKey: key },
      orderBy: { version: "desc" },
    });
    return current ? { body: current.body, version: current.version } : { body: PLATFORM_DEFAULT_BODY[key], version: 0 };
  }

  preview(key: MessageTemplateKey, body: string, sample: Readonly<Record<string, string>>): string {
    try {
      return renderTemplate(body, sample);
    } catch {
      return body;
    }
  }

  async publish(tenantId: string, key: MessageTemplateKey, body: string, actor: MessagesActor): Promise<TemplateView> {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new BadRequestException({ code: "body_required", message: "The message cannot be empty." });
    }

    const missing = firstMissingRequiredVariable(key, trimmed);
    if (missing) {
      throw new BadRequestException({
        code: "missing_required_variable",
        message: `This template must include {{${missing}}} before it can be published.`,
        details: { variable: missing },
      });
    }

    const latest = await this.prisma.messageTemplate.findFirst({
      where: { tenantId, templateKey: key },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const row = await this.prisma.messageTemplate.create({
      data: {
        tenantId,
        templateKey: key,
        body: trimmed,
        version: nextVersion,
        publishedById: actor.accountId,
      },
    });

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "MessageTemplate",
      targetId: `${key}:v${nextVersion}`,
      action: "message_template.published",
      after: { templateKey: key, version: nextVersion, body: trimmed },
      riskLevel: "MEDIUM",
    });

    const def = MESSAGE_TEMPLATE_REGISTRY[key];
    return {
      key,
      label: def.label,
      requiredVariables: def.requiredVariables,
      availableVariables: def.availableVariables,
      body: row.body,
      version: row.version,
      publishedAt: row.publishedAt.toISOString(),
      isPublished: true,
    };
  }

  private async currentRows(tenantId: string) {
    // One query, all templates: the latest row per templateKey. Prisma
    // has no `DISTINCT ON`, so this reads every version and keeps the
    // highest -- fine at this volume (8 keys x a handful of edits each),
    // not the kind of table that ever needs pagination.
    const rows = await this.prisma.messageTemplate.findMany({
      where: { tenantId },
      orderBy: { version: "asc" },
    });
    const latestByKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) latestByKey.set(row.templateKey, row);
    return [...latestByKey.values()];
  }
}
