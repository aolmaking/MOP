import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilitiesModule } from "../capabilities/capabilities.module";
import { AccessController } from "./access.controller";
import { EffectiveAccessService } from "./effective-access.service";
import { PermissionResolverService } from "./permission-resolver.service";
import { PermissionContextService } from "./permission-context.service";
import { ScopeResolverService } from "./scope-resolver.service";
import { PlatformControlLayer } from "./layers/platform-control.layer";
import { PlanEntitlementLayer } from "./layers/plan-entitlement.layer";
import { TenantStatusLayer } from "./layers/tenant-status.layer";
import { StaffRestrictionLayer } from "./layers/staff-restriction.layer";
import { TenantCapabilityLayer } from "./layers/tenant-capability.layer";
import { ModuleEnabledLayer } from "./layers/module-enabled.layer";
import { FeatureEnabledLayer } from "./layers/feature-enabled.layer";
import { WorkshopConfigurationLayer } from "./layers/workshop-configuration.layer";
import { DelegationLayer } from "./layers/delegation.layer";
import { RolePermissionTemplateLayer } from "./layers/role-permission-template.layer";
import { UserOverrideLayer } from "./layers/user-override.layer";

@Module({
  imports: [AuthModule, CapabilitiesModule],
  controllers: [AccessController],
  providers: [
    PlatformControlLayer,
    PlanEntitlementLayer,
    TenantStatusLayer,
    StaffRestrictionLayer,
    TenantCapabilityLayer,
    ModuleEnabledLayer,
    FeatureEnabledLayer,
    WorkshopConfigurationLayer,
    DelegationLayer,
    RolePermissionTemplateLayer,
    UserOverrideLayer,
    PermissionContextService,
    PermissionResolverService,
    ScopeResolverService,
    EffectiveAccessService,
  ],
  exports: [EffectiveAccessService],
})
export class AccessModule {}
