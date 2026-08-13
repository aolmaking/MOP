import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { TEAM_API_BASE_PATH, TeamApi } from './features/branch-manager/team/team.api';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
  {
    // Public, and deliberately outside every shell: the person arriving
    // here has no account yet, which is the whole point. The URL shape
    // matches what PlatformService already puts in the invite link.
    path: 'invite/accept',
    loadComponent: () => import('./features/invite/invite-accept').then((m) => m.InviteAccept),
  },
  {
    // The only self-registration path in the whole product -- public,
    // same reasoning as invite/accept above. Accepts ?workshop= or
    // ?code= from a branch QR code / invite link.
    path: 'register',
    loadComponent: () => import('./features/register/register-page').then((m) => m.RegisterPage),
  },
  {
    // Reached only from Login's tenant_unavailable response -- valid
    // credentials, frozen/suspended/archived tenant. A deliberate dead
    // end, so it needs no guard and no shell of its own.
    path: 'tenant-frozen',
    loadComponent: () => import('./features/tenant-frozen/tenant-frozen-page').then((m) => m.TenantFrozenPage),
  },
  {
    // The public decision link -- what a WhatsApp message points at. No
    // guard, deliberately: requiring a login first would break the flow
    // the whole feature exists for. The token scopes it to one request.
    path: 'decide/:token',
    loadComponent: () => import('./features/customer/decision-page').then((m) => m.DecisionPage),
  },
  {
    path: 'platform',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/platform-shell/platform-shell').then((m) => m.PlatformShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'workshops' },
      {
        // The spec'd landing page for this role, and the page the rail
        // has been pointing at since Phase 2.
        path: 'workshops',
        loadComponent: () =>
          import('./features/platform/workshops/workshops-page').then((m) => m.WorkshopsPage),
      },
      {
        path: 'workshops/new',
        loadComponent: () => import('./features/platform/add-workshop/add-workshop-page').then((m) => m.AddWorkshopPage),
      },
      {
        path: 'workshops/:id/capabilities',
        loadComponent: () =>
          import('./features/platform/capabilities/capabilities-page').then((m) => m.CapabilitiesPage),
      },
      {
        // Level 1: the aggregated workshop-card view. Level 2 is
        // 'reports/:id' below -- Usage Overview only, see PAGE_INVENTORY.md
        // for the five sections deliberately not built this pass.
        path: 'reports',
        loadComponent: () => import('./features/platform/reports/reports-page').then((m) => m.ReportsPage),
      },
      {
        path: 'reports/:id',
        loadComponent: () =>
          import('./features/platform/reports/workshop-usage-page').then((m) => m.WorkshopUsagePage),
      },
    ],
  },
  {
    // The Branch Manager gets its own shell, like the platform side: one
    // shell per role rather than one shell branching on role.
    //
    // Declared before the '' route on purpose: '' matches as a prefix, so
    // leaving this last would make every /branch/* URL depend on Angular
    // backtracking out of the fallback shell.
    path: 'branch',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/branch-shell/branch-shell').then((m) => m.BranchShell),
    children: [
      // The branch manager's landing page: "what needs me?" answered with
      // no click, filter or memory of where they were. Everything else in
      // the role is reached from here.
      { path: '', pathMatch: 'full', redirectTo: 'attention' },
      {
        path: 'attention',
        loadComponent: () =>
          import('./features/branch-manager/attention-center/attention-center').then((m) => m.AttentionCenter),
      },
      {
        path: 'intake',
        loadComponent: () => import('./features/branch-manager/intake/intake-page').then((m) => m.IntakePage),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./features/branch-manager/approvals/approvals-page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'delivery',
        loadComponent: () => import('./features/branch-manager/approvals/delivery-page').then((m) => m.DeliveryPage),
      },
      {
        // Reached from Delivery, where the balance is what holds a car.
        path: 'payments/:id',
        loadComponent: () => import('./features/finance/take-payment').then((m) => m.TakePayment),
      },
      {
        // Reachable only where the owner has delegated team management.
        // The route always exists; the page itself says so when it has
        // not been, which is better than a 404 that looks like a bug.
        path: 'team',
        loadComponent: () => import('./features/branch-manager/team/team-setup-page').then((m) => m.TeamSetupPage),
      },
      {
        path: 'work-orders',
        loadComponent: () =>
          import('./features/branch-manager/work-orders/work-orders-board').then((m) => m.WorkOrdersBoard),
      },
      {
        // `id` binds to the component's input of the same name --
        // withComponentInputBinding() is on in app.config.
        path: 'work-orders/:id',
        loadComponent: () =>
          import('./features/branch-manager/work-orders/work-order-workspace').then((m) => m.WorkOrderWorkspace),
      },
    ],
  },
  {
    // The Tenant Owner shell. Audit was the first page built, because
    // AuditLog had been written since Phase 1 and read by nothing; Home
    // followed once OwnerHomeService had a page calling it. Six Owner
    // pages remain owed -- see PAGE_INVENTORY.md.
    path: 'owner',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/owner-shell/owner-shell').then((m) => m.OwnerShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./features/owner/owner-home-page').then((m) => m.OwnerHomePage),
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/owner/audit-page').then((m) => m.AuditPage),
      },
      {
        // Staff / Branches / Warehouses tabs.
        path: 'organization',
        loadComponent: () =>
          import('./features/owner/organization/organization-page').then((m) => m.OrganizationPage),
      },
      {
        // The Teams tab reuses Branch Manager's TeamSetupPage verbatim,
        // pointed at /organization/teams instead of /branch/teams via
        // TEAM_API_BASE_PATH -- same TeamSetupService server-side, same
        // component, no second implementation. See team.api.ts and
        // team-setup-page.ts's `forOwner` branch for the two small
        // copy differences (this route has no delegation to explain).
        path: 'organization/teams',
        loadComponent: () =>
          import('./features/branch-manager/team/team-setup-page').then((m) => m.TeamSetupPage),
        data: { teamsForOwner: true },
        // Re-providing TeamApi itself (not just the token) forces a fresh
        // instance scoped to this route, so it actually picks up the
        // overridden token instead of reusing the root singleton that
        // may already have resolved to the Branch Manager's path.
        providers: [{ provide: TEAM_API_BASE_PATH, useValue: '/api/v1/organization/teams' }, TeamApi],
      },
      {
        path: 'messages',
        loadComponent: () => import('./features/owner/messages/messages-page').then((m) => m.MessagesPage),
      },
      {
        path: 'forms',
        loadComponent: () => import('./features/owner/forms/forms-page').then((m) => m.FormsPage),
      },
      {
        path: 'pricing',
        loadComponent: () => import('./features/owner/pricing/pricing-page').then((m) => m.PricingPage),
      },
    ],
  },
  {
    // The Team Leader shell -- all four pages ship together (PHASE_10.md
    // section 3), so unlike Branch Manager's delegated Teams entry there
    // is nothing here that arrives later.
    path: 'team-leader',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/team-leader-shell/team-leader-shell').then((m) => m.TeamLeaderShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/team-leader/team-leader-home').then((m) => m.TeamLeaderHome),
      },
      {
        path: 'technicians',
        loadComponent: () => import('./features/team-leader/technicians-page').then((m) => m.TechniciansPage),
      },
      {
        path: 'work-orders',
        loadComponent: () => import('./features/team-leader/team-work-orders').then((m) => m.TeamWorkOrders),
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/team-leader/team-reports').then((m) => m.TeamReports),
      },
    ],
  },
  {
    // The Customer Portal shell -- bottom nav like the technician shell,
    // for the same reason (a phone held one-handed), though the two
    // personas are otherwise unrelated. See docs/phases/PHASE_11.md.
    path: 'customer',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/customer-shell/customer-shell').then((m) => m.CustomerShell),
    children: [
      { path: '', loadComponent: () => import('./features/customer/portal-home').then((m) => m.PortalHome) },
      { path: 'assets', loadComponent: () => import('./features/customer/my-assets').then((m) => m.MyAssets) },
      {
        path: 'service',
        loadComponent: () => import('./features/customer/current-service').then((m) => m.CurrentService),
      },
      {
        path: 'invoices',
        loadComponent: () => import('./features/customer/invoice-status').then((m) => m.InvoiceStatus),
      },
      { path: 'history', loadComponent: () => import('./features/customer/safe-history').then((m) => m.SafeHistory) },
    ],
  },
  {
    // The inventory manager sits at a desk and works long sessions, so
    // this is a rail like the platform and branch sides -- the opposite
    // requirement to the technician's, which is why they are separate
    // shells. See docs/phases/PHASE_7.md.
    path: 'inventory',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/inventory-shell/inventory-shell').then((m) => m.InventoryShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        // The spec's default landing page for this role: daily triage
        // before anything else, the storekeeper's Attention Center.
        path: 'home',
        loadComponent: () => import('./features/inventory/inventory-home').then((m) => m.InventoryHomePage),
      },
      {
        path: 'catalog',
        loadComponent: () => import('./features/inventory/inventory-catalog').then((m) => m.InventoryCatalog),
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/inventory/inventory-reports').then((m) => m.InventoryReportsPage),
      },
      {
        path: 'requests',
        loadComponent: () => import('./features/inventory/inventory-requests').then((m) => m.InventoryRequests),
      },
      {
        path: 'stock',
        loadComponent: () => import('./features/inventory/inventory-stock').then((m) => m.InventoryStock),
      },
      {
        path: 'items/:id',
        loadComponent: () => import('./features/inventory/inventory-item').then((m) => m.InventoryItem),
      },
      {
        path: 'returns',
        loadComponent: () => import('./features/inventory/inventory-returns').then((m) => m.InventoryReturns),
      },
    ],
  },
  {
    // The technician's own shell: three pages, no admin sidebar, and a
    // density layer built for a gloved hand. See docs/phases/PHASE_6.md.
    path: 'tech',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/technician-shell/technician-shell').then((m) => m.TechnicianShell),
    children: [
      { path: '', loadComponent: () => import('./features/technician/tech-now').then((m) => m.TechNow) },
      { path: 'work', loadComponent: () => import('./features/technician/tech-my-work').then((m) => m.TechMyWork) },
      {
        path: 'card/:id',
        loadComponent: () => import('./features/technician/tech-work-card').then((m) => m.TechWorkCard),
      },
    ],
  },
  {
    // The fallback frame, for roles whose own shell is not built yet.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./features/home/placeholder-home').then((m) => m.PlaceholderHome) },
    ],
  },
  { path: '**', redirectTo: '' },
];
