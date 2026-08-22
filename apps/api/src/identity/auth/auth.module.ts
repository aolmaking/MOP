import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InviteService } from "./invite.service";
import { PasswordResetService } from "./password-reset.service";
import { SessionGuard } from "./session.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, InviteService, PasswordResetService],
  exports: [AuthService, SessionGuard, InviteService, PasswordResetService],
})
export class AuthModule {}
