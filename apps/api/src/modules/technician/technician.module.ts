import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { FinanceModule } from "../finance/finance.module";
import { TechnicianController } from "./technician.controller";
import { TechnicianService } from "./technician.service";

@Module({
  imports: [AuthModule, OperationEventsModule, FinanceModule],
  controllers: [TechnicianController],
  providers: [TechnicianService]
})
export class TechnicianModule {}
