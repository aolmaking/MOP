import { Module } from "@nestjs/common";
import { DatabaseModule } from "../runtime/database/database.module";
import { SpecializationService } from "./specialization.service";
import { CredentialService } from "./credential.service";
import { PositionTaxonomyService } from "./position-taxonomy.service";

/**
 * Phase 15's specialization primitives. No controller yet -- this phase's
 * exit bar is explicitly "created via API/seed," not a page anyone can
 * reach; the authoring UI is Phase 17 and the pages that consume these
 * primitives are follow-on work once 15-17 land (see docs/phases/PHASE_15.md).
 * Exported so those later phases inject these services directly rather
 * than rebuilding this data access.
 */
@Module({
  imports: [DatabaseModule],
  providers: [SpecializationService, CredentialService, PositionTaxonomyService],
  exports: [SpecializationService, CredentialService, PositionTaxonomyService],
})
export class SpecializationModule {}
