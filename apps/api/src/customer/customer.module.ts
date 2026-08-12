import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OperationEventsModule } from "../operations/operation-events.module";
import { CustomerDecisionController } from "./decision.controller";
import { CustomerDecisionService } from "./decision.service";

/**
 * The customer-facing surface.
 *
 * Deliberately its own module, and deliberately without AuthModule: the
 * decision link is public by design, and keeping it out of the
 * authenticated tree makes that a structural fact rather than a
 * decorator somebody could add by accident.
 */
@Module({
  imports: [DatabaseModule, OperationEventsModule],
  controllers: [CustomerDecisionController],
  providers: [CustomerDecisionService],
})
export class CustomerModule {}
