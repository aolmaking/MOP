import { Module } from "@nestjs/common";
import { CapabilitiesModule } from "../../control/capabilities/capabilities.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InviteService } from "./invite.service";
import { PasswordResetService } from "./password-reset.service";
import { SessionGuard } from "./session.guard";

@Module({
  // The session's enabledModules are derived from the tenant's live
  // capabilities, not read from a stored list that could not be kept in step.
  imports: [CapabilitiesModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, InviteService, PasswordResetService],
  exports: [AuthService, SessionGuard, InviteService, PasswordResetService],
})
export class AuthModule {}
