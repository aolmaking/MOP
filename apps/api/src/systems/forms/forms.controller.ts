import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { FORM_KEYS, isFormKey } from "./form-registry";
import { CustomFieldsService, type FormFieldsView } from "./custom-fields.service";
import { AddFieldDto } from "./forms.dto";

@Controller("organization/forms")
@UseGuards(SessionGuard)
export class FormsController {
  constructor(
    private readonly fields: CustomFieldsService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async list(@CurrentSession() session: SessionContext): Promise<{ key: string; label: string }[]> {
    await this.require(session);
    return FORM_KEYS.map((key) => ({ key, label: key }));
  }

  @Get(":formKey")
  async form(@CurrentSession() session: SessionContext, @Param("formKey") formKey: string): Promise<FormFieldsView> {
    const tenantId = await this.require(session);
    this.requireValidForm(formKey);
    return this.fields.list(tenantId, formKey);
  }

  @Post(":formKey")
  async addField(
    @CurrentSession() session: SessionContext,
    @Param("formKey") formKey: string,
    @Body() dto: AddFieldDto,
  ) {
    const tenantId = await this.require(session);
    this.requireValidForm(formKey);
    return this.fields.addField(tenantId, formKey, dto, this.actorOf(session));
  }

  @Patch("fields/:id/archived")
  async setArchived(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { archived: boolean },
  ): Promise<{ ok: true }> {
    const tenantId = await this.require(session);
    await this.fields.setArchived(tenantId, id, body.archived, this.actorOf(session));
    return { ok: true };
  }

  private requireValidForm(formKey: string): asserts formKey is (typeof FORM_KEYS)[number] {
    if (!isFormKey(formKey)) {
      throw new ForbiddenException({ code: "unknown_form", message: "That form does not exist." });
    }
  }

  private actorOf(session: SessionContext) {
    return { accountId: session.accountId, displayName: session.displayName };
  }

  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "organization.forms.manage");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to Forms & Fields." });
    }
    return session.tenantId;
  }
}
