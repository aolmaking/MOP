import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { AuthModule } from "../../../identity/auth/auth.module";
import { SpecializationService } from "./specialization.service";
import { CredentialService } from "./credential.service";
import { PositionTaxonomyService } from "./position-taxonomy.service";
import { SpecializationController } from "./specialization.controller";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SpecializationController],
  providers: [SpecializationService, CredentialService, PositionTaxonomyService],
  exports: [SpecializationService, CredentialService, PositionTaxonomyService],
})
export class SpecializationModule {}
