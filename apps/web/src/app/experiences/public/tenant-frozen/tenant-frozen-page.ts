import { Component } from '@angular/core';

/**
 * Tenant Frozen / Workspace Unavailable, per
 * docs/detailed-specs/shared-system-pages.md.
 *
 * Reached only from Login's "tenant_unavailable" response -- credentials
 * were valid, but the tenant is FROZEN/SUSPENDED/ARCHIVED. Deliberately a
 * dead end: no nav, no retry, no reason beyond the one fixed sentence the
 * spec gives verbatim. The actual freeze reason lives in Super Admin's
 * audit trail only, never surfaced here.
 */
@Component({
  selector: 'app-tenant-frozen-page',
  templateUrl: './tenant-frozen-page.html',
  styleUrl: './tenant-frozen-page.css',
})
export class TenantFrozenPage {}
