import { Module } from "@nestjs/common";
import { DatabaseModule } from "../runtime/database/database.module";
import { AuthModule } from "../identity/auth/auth.module";
import { AccessModule } from "../identity/access/access.module";
import { AuditModule } from "../audit/audit.module";
import { FormsController } from "./forms.controller";
import { CustomFieldsService } from "./custom-fields.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule],
  controllers: [FormsController],
  providers: [CustomFieldsService],
  // Consumed by future form-recording services (e.g. inspection
  // recording) once their pages exist.
  exports: [CustomFieldsService],
})
export class FormsModule {}
