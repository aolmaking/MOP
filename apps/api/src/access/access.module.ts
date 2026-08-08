import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessController } from "./access.controller";
import { EffectiveAccessService } from "./effective-access.service";
import { PermissionResolverService } from "./permission-resolver.service";
import { ScopeResolverService } from "./scope-resolver.service";
import { PlatformControlLayer } from "./layers/platform-control.layer";
import { PlanEntitlementLayer } from "./layers/plan-entitlement.layer";
import { TenantStatusLayer } from "./layers/tenant-status.layer";
import { ModuleEnabledLayer } from "./layers/module-enabled.layer";
import { FeatureEnabledLayer } from "./layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "./layers/workshop-configuration.layer";
import { RolePermissionTemplateLayer } from "./layers/role-permission-template.layer";
import { UserOverrideLayer } from "./layers/user-override.layer";

@Module({
  imports: [AuthModule],
  controllers: [AccessController],
  providers: [
    PlatformControlLayer,
    PlanEntitlementLayer,
    TenantStatusLayer,
    ModuleEnabledLayer,
    FeatureEnabledLayer,
    WorkshopConfigurationLayer,
    RolePermissionTemplateLayer,
    UserOverrideLayer,
    PermissionResolverService,
    ScopeResolverService,
    EffectiveAccessService,
  ],
  exports: [EffectiveAccessService],
})
export class AccessModule {}
