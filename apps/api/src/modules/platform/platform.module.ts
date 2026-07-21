import { Module } from "@nestjs/common";
import { AccessModule } from "../../access/access.module";
import { AuthModule } from "../../auth/auth.module";
import { DatabaseModule } from "../../database/database.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [DatabaseModule, AccessModule, AuthModule, OperationEventsModule],
  controllers: [PlatformController],
  providers: [PlatformService]
})
export class PlatformModule {}
