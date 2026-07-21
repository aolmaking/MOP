import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";
import { EffectiveAccessResolverService } from "./effective-access-resolver.service";

@Module({
  imports: [AccessModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, EffectiveAccessResolverService],
  exports: [AuthService, SessionGuard, EffectiveAccessResolverService]
})
export class AuthModule {}
