import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { InviteService } from "./invite.service";
import { SessionGuard } from "./session.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, InviteService],
  exports: [AuthService, SessionGuard, InviteService],
})
export class AuthModule {}
