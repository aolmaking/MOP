import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { BuilderDraftUpdateDto, BuilderPageKey, BuilderPreviewRequest, OwnerConfigurationDraftDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { BuilderService } from "./builder.service";

@Controller("builder")
@UseGuards(SessionGuard)
export class BuilderController {
  constructor(
    private readonly builder: BuilderService,
    private readonly access: AccessService
  ) {}

  @Get("home")
  home(@Req() req: RequestWithSession) {
    this.access.assert("builder.read", req.session);
    return this.builder.home(req.session);
  }

  @Get("draft")
  draft(@Req() req: RequestWithSession) {
    this.access.assert("builder.read", req.session);
    return this.builder.getDraft(req.session);
  }

  @Post("draft")
  updateDraft(@Req() req: RequestWithSession, @Body() body: BuilderDraftUpdateDto) {
    this.access.assert("builder.read", req.session);
    this.assertDraftEditPermissions(req, body);
    return this.builder.updateDraft(req.session, body);
  }

  @Post("preview")
  preview(@Req() req: RequestWithSession, @Body() body: BuilderPreviewRequest) {
    this.access.assert("builder.preview", req.session);
    return this.builder.preview(req.session, body);
  }

  @Get("validate")
  validate(@Req() req: RequestWithSession) {
    this.access.assert("builder.validate", req.session);
    return this.builder.validate(req.session);
  }

  @Get("impact")
  impact(@Req() req: RequestWithSession) {
    this.access.assert("builder.validate", req.session);
    return this.builder.impact(req.session);
  }

  @Get("presets")
  presets(@Req() req: RequestWithSession) {
    this.access.assert("builder.read", req.session);
    return this.builder.presets();
  }

  @Post("apply-preset")
  applyPreset(@Req() req: RequestWithSession, @Body() body: { presetId: string }) {
    this.access.assert("builder.pages.edit", req.session);
    this.access.assert("builder.brand.edit", req.session);
    return this.builder.applyPreset(req.session, body.presetId);
  }

  @Post("discard-draft")
  discardDraft(@Req() req: RequestWithSession) {
    this.access.assert("builder.pages.edit", req.session);
    return this.builder.discardDraft(req.session);
  }

  @Post("reset-page")
  resetPage(@Req() req: RequestWithSession, @Body() body: { pageKey: BuilderPageKey }) {
    this.access.assert("builder.pages.edit", req.session);
    return this.builder.resetPage(req.session, body.pageKey);
  }

  @Post("reset-section")
  resetSection(@Req() req: RequestWithSession, @Body() body: { pageKey: BuilderPageKey; sectionId: string }) {
    this.access.assert("builder.pages.edit", req.session);
    return this.builder.resetSection(req.session, body.pageKey, body.sectionId);
  }

  @Post("publish")
  publish(@Req() req: RequestWithSession, @Body() body: { reason?: string }) {
    this.access.assert("builder.publish", req.session);
    return this.builder.publish(req.session, body?.reason);
  }

  @Post("rollback")
  rollback(@Req() req: RequestWithSession, @Body() body: { versionId: string }) {
    this.access.assert("builder.rollback", req.session);
    return this.builder.rollback(req.session, body.versionId);
  }

  @Get("history")
  history(@Req() req: RequestWithSession) {
    this.access.assert("builder.audit.view", req.session);
    return this.builder.history(req.session);
  }

  @Get("configuration-permissions")
  configurationPermissions(@Req() req: RequestWithSession) {
    this.access.assert("configuration.permissions.view", req.session);
    return this.builder.configurationPermissions(req.session);
  }

  @Post("configuration-permissions/draft")
  saveConfigurationPermissionsDraft(@Req() req: RequestWithSession, @Body() body: OwnerConfigurationDraftDto) {
    this.access.assert("configuration.permissions.edit", req.session);
    return this.builder.saveConfigurationPermissionsDraft(req.session, body);
  }

  @Post("configuration-permissions/impact")
  previewConfigurationPermissions(@Req() req: RequestWithSession, @Body() body?: OwnerConfigurationDraftDto) {
    this.access.assert("configuration.permissions.view", req.session);
    return this.builder.previewConfigurationPermissions(req.session, body);
  }

  @Post("configuration-permissions/apply")
  applyConfigurationPermissions(@Req() req: RequestWithSession, @Body() body: OwnerConfigurationDraftDto) {
    this.access.assert("configuration.permissions.edit", req.session);
    return this.builder.applyConfigurationPermissions(req.session, body);
  }

  @Post("configuration-permissions/reset-template")
  resetConfigurationRoleTemplate(@Req() req: RequestWithSession, @Body() body: { role: string }) {
    this.access.assert("configuration.templates.edit", req.session);
    return this.builder.resetConfigurationRoleTemplate(req.session, body.role);
  }

  private assertDraftEditPermissions(req: RequestWithSession, body: BuilderDraftUpdateDto) {
    if (body.designTokens) this.access.assert("builder.brand.edit", req.session);
    if (body.pageTemplates) this.access.assert("builder.pages.edit", req.session);
    if (body.roleExperiences) this.access.assert("builder.role_experience.edit", req.session);
    if (body.featurePolicies || body.workflowPolicies) this.access.assert("builder.workflow.edit", req.session);
    if (body.formSchemas) this.access.assert("builder.forms.edit", req.session);
    if (body.messageTemplates) this.access.assert("builder.messages.edit", req.session);
  }
}
