import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { AuthModule } from "../../../identity/auth/auth.module";
import { AccessModule } from "../../../identity/access/access.module";
import { AuditModule } from "../../../audit/audit.module";
import { MessagesController } from "./messages.controller";
import { MessageTemplateService } from "./message-template.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule],
  controllers: [MessagesController],
  providers: [MessageTemplateService],
})
export class MessagesModule {}
