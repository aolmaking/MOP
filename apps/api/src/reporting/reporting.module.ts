import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { ReportingController } from "./reporting.controller";
import { ReportingService } from "./reporting.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
