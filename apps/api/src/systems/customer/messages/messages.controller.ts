import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../../identity/auth/session.guard";
import { CurrentSession } from "../../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../../identity/access/effective-access.service";
import { MessageTemplateService, type TemplateView } from "./message-template.service";
import { PublishTemplateDto } from "./messages.dto";

const SAMPLE_DATA = {
  customer_name: "Sara Ahmed",
  work_order_id: "WO-10432",
  branch_name: "Downtown Branch",
  decision_link: "https://app.example.com/decide/sample-token",
  total_amount: "1,250.00 EGP",
};

@Controller("organization/messages")
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(
    private readonly templates: MessageTemplateService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async list(@CurrentSession() session: SessionContext): Promise<TemplateView[]> {
    const tenantId = await this.require(session);
    return this.templates.list(tenantId);
  }

  @Post("preview")
  preview(@Body() body: { key: string; body: string }): { preview: string } {
    return { preview: this.templates.preview(body.key as never, body.body, SAMPLE_DATA) };
  }

  @Post()
  async publish(@CurrentSession() session: SessionContext, @Body() dto: PublishTemplateDto): Promise<TemplateView> {
    const tenantId = await this.require(session);
    return this.templates.publish(tenantId, dto.key, dto.body, {
      accountId: session.accountId,
      displayName: session.displayName,
    });
  }

  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "organization.messages.manage");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to Messages & Templates.",
      });
    }
    return session.tenantId;
  }
}
