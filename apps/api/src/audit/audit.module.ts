import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";

/**
 * The audit WRITE boundary, and deliberately a dependency-free leaf.
 *
 * Nearly every module imports this one, so it must import almost nothing
 * back. An earlier version of the Owner's History page put the read
 * controller here, which meant AuditModule needed AccessModule for a
 * permission check -- and AccessModule imports CapabilitiesModule, which
 * imports AuditModule. Nest refused to start.
 *
 * The reader lives in `experiences/owner/` instead. That is also what
 * tools/lint-audit-boundary.mjs already assumes: it guards writes only,
 * and says in its own comment that reading for the Owner's History page
 * is fine anywhere.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
