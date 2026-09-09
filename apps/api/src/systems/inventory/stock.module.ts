import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { StockService } from "./stock.service";

/**
 * The stock ledger, on its own.
 *
 * `StockService` lived in `InventoryModule`, which imports `OperationsModule`
 * so the part-request flow can reach the lifecycle service. That made the
 * ledger unreachable from Operations without a cycle — and Operations needs it,
 * because settling a work order's reservations belongs to the one service that
 * owns every terminal transition.
 *
 * A `forwardRef` would have made the cycle compile. This says the truer thing
 * instead: the ledger depends on nothing but the database, so it is a leaf that
 * both systems import rather than something either of them owns.
 */
@Module({
  imports: [DatabaseModule],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
