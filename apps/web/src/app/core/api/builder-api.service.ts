import { Injectable, inject } from "@angular/core";
import type {
  BuilderConfiguration,
  BuilderDraftUpdateDto,
  BuilderHomeDto,
  BuilderImpactPreview,
  BuilderPageKey,
  BuilderPreset,
  BuilderPreviewRequest,
  BuilderPreviewResponse,
  BuilderPublishResult,
  BuilderRollbackResult,
  BuilderValidationResult,
  OwnerConfigurationDraftDto,
  OwnerConfigurationPermissionsDto,
  OwnerPermissionImpactPreviewDto
} from "@mop/shared";
import { firstValueFrom } from "rxjs";
import { ApiClient } from "./api-client.service";
import { normalizeApiError } from "./api-errors";

export interface BuilderHistoryRow {
  versionId: string;
  publishedAt: string;
  publishedBy: string;
  reason?: string;
}

@Injectable({ providedIn: "root" })
export class BuilderApiService {
  private readonly api = inject(ApiClient);

  home() { return this.request(() => firstValueFrom(this.api.get<BuilderHomeDto>("/builder/home")), "Builder home failed."); }
  draft() { return this.request(() => firstValueFrom(this.api.get<BuilderConfiguration>("/builder/draft")), "Builder draft failed."); }
  updateDraft(input: BuilderDraftUpdateDto) { return this.request(() => firstValueFrom(this.api.post<BuilderConfiguration>("/builder/draft", input)), "Builder draft save failed."); }
  preview(input: BuilderPreviewRequest) { return this.request(() => firstValueFrom(this.api.post<BuilderPreviewResponse>("/builder/preview", input)), "Builder preview failed."); }
  validate() { return this.request(() => firstValueFrom(this.api.get<BuilderValidationResult>("/builder/validate")), "Builder validation failed."); }
  impact() { return this.request(() => firstValueFrom(this.api.get<BuilderImpactPreview>("/builder/impact")), "Builder impact failed."); }
  presets() { return this.request(() => firstValueFrom(this.api.get<BuilderPreset[]>("/builder/presets")), "Builder presets failed."); }
  applyPreset(presetId: string) { return this.request(() => firstValueFrom(this.api.post<BuilderConfiguration>("/builder/apply-preset", { presetId })), "Builder preset failed."); }
  discardDraft() { return this.request(() => firstValueFrom(this.api.post<BuilderConfiguration>("/builder/discard-draft", {})), "Builder discard draft failed."); }
  resetPage(pageKey: BuilderPageKey) { return this.request(() => firstValueFrom(this.api.post<BuilderConfiguration>("/builder/reset-page", { pageKey })), "Builder page reset failed."); }
  resetSection(pageKey: BuilderPageKey, sectionId: string) { return this.request(() => firstValueFrom(this.api.post<BuilderConfiguration>("/builder/reset-section", { pageKey, sectionId })), "Builder section reset failed."); }
  publish(reason?: string) { return this.request(() => firstValueFrom(this.api.post<BuilderPublishResult>("/builder/publish", { reason })), "Builder publish failed."); }
  rollback(versionId: string) { return this.request(() => firstValueFrom(this.api.post<BuilderRollbackResult>("/builder/rollback", { versionId })), "Builder rollback failed."); }
  history() { return this.request(() => firstValueFrom(this.api.get<BuilderHistoryRow[]>("/builder/history")), "Builder history failed."); }
  configurationPermissions() { return this.request(() => firstValueFrom(this.api.get<OwnerConfigurationPermissionsDto>("/builder/configuration-permissions")), "Configuration permissions failed."); }
  saveConfigurationPermissionsDraft(input: OwnerConfigurationDraftDto) { return this.request(() => firstValueFrom(this.api.post<OwnerConfigurationPermissionsDto>("/builder/configuration-permissions/draft", input)), "Configuration permissions draft failed."); }
  previewConfigurationPermissions(input?: OwnerConfigurationDraftDto) { return this.request(() => firstValueFrom(this.api.post<OwnerPermissionImpactPreviewDto>("/builder/configuration-permissions/impact", input || {})), "Configuration permissions impact failed."); }
  applyConfigurationPermissions(input: OwnerConfigurationDraftDto) { return this.request(() => firstValueFrom(this.api.post<OwnerConfigurationPermissionsDto>("/builder/configuration-permissions/apply", input)), "Configuration permissions apply failed."); }
  resetConfigurationRoleTemplate(role: string) { return this.request(() => firstValueFrom(this.api.post<OwnerConfigurationPermissionsDto>("/builder/configuration-permissions/reset-template", { role })), "Configuration role template reset failed."); }

  private async request<T>(run: () => Promise<T>, fallback: string) {
    try {
      return await run();
    } catch (error) {
      throw normalizeApiError(error, fallback);
    }
  }
}
