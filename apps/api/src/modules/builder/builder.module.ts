import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { BuilderController } from "./builder.controller";
import { BuilderService } from "./builder.service";

@Module({
  imports: [AuthModule, OperationEventsModule],
  controllers: [BuilderController],
  providers: [BuilderService]
})
export class BuilderModule {}
