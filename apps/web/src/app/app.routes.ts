import { Routes } from '@angular/router';
import { authGuard } from './identity/auth.guard';
import { TEAM_API_BASE_PATH, TeamApi } from './experiences/branch-manager/team/team.api';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./experiences/public/login/login-page').then((m) => m.LoginPage) },
  {
    path: 'password-reset',
    loadComponent: () => import('./experiences/public/password-reset/password-reset-page').then((m) => m.PasswordResetPage),
  },
  {
    path: 'access-denied',
    loadComponent: () => import('./experiences/public/access-denied/access-denied-page').then((m) => m.AccessDeniedPage),
  },
  {
    // Public, and deliberately outside every shell: the person arriving
    // here has no account yet, which is the whole point. The URL shape
    // matches what PlatformService already puts in the invite link.
    path: 'invite/accept',
    loadComponent: () => import('./experiences/public/invite/invite-accept').then((m) => m.InviteAccept),
  },
  {
    // The only self-registration path in the whole product -- public,
    // same reasoning as invite/accept above. Accepts ?workshop= or
    // ?code= from a branch QR code / invite link.
    path: 'register',
    loadComponent: () => import('./experiences/public/register/register-page').then((m) => m.RegisterPage),
  },
  {
    // Reached only from Login's tenant_unavailable response -- valid
    // credentials, frozen/suspended/archived tenant. A deliberate dead
    // end, so it needs no guard and no shell of its own.
    path: 'tenant-frozen',
    loadComponent: () => import('./experiences/public/tenant-frozen/tenant-frozen-page').then((m) => m.TenantFrozenPage),
  },
  {
    // The public decision link -- what a WhatsApp message points at. No
    // guard, deliberately: requiring a login first would break the flow
    // the whole feature exists for. The token scopes it to one request.
    path: 'decide/:token',
    loadComponent: () => import('./experiences/customer/decision-page').then((m) => m.DecisionPage),
  },
  {
    path: 'platform',
    canActivate: [authGuard],
    loadComponent: () => import('./experiences/platform/shell/platform-shell').then((m) => m.PlatformShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'workshops' },
      {
        // The spec'd landing page for this role, and the page the rail
        // has been pointing at since Phase 2.
        path: 'workshops',
        loadComponent: () =>
          import('./experiences/platform/workshops/workshops-page').then((m) => m.WorkshopsPage),
      },
      {
        // Governance Controls. The rail has pointed here since Phase 2
        // with no route behind it, so the link landed on the fallback
        // placeholder -- while the platform-only backend it needs
        // (permission locks, tenant archive/reactivate) already existed
        // and was reachable only by calling the API directly.
        path: 'control-center',
        loadComponent: () =>
          import('./experiences/platform/control-center/control-center-page').then((m) => m.ControlCenterPage),
      },
      {
        // The last rail link that pointed at nothing. Backed by a real
        // cross-tenant read (platform/live-view) rather than a mock --
        // it is the only endpoint in the product that aggregates across
        // tenants, which is why it exposes counts and event kinds only.
        path: 'live-view',
        loadComponent: () =>
          import('./experiences/platform/live-view/live-view-page').then((m) => m.LiveViewPage),
      },
      {
        // The workshop creation journey. Replaces the single-form Add
        // Workshop page: creating a workshop is the act of defining its
        // operating model, not filling in eighteen fields, and the form
        // could express none of the capability, policy, responsibility or
        // structure decisions that actually shape one.
        path: 'workshops/new',
        loadComponent: () => import('./experiences/platform/onboarding/onboarding-page').then((m) => m.OnboardingPage),
      },
      {
        path: 'workshops/:id/capabilities',
        loadComponent: () =>
          import('./experiences/platform/capabilities/capabilities-page').then((m) => m.CapabilitiesPage),
      },
      {
        // Level 1: the aggregated workshop-card view. Level 2 is
        // 'reports/:id' below -- Usage Overview only, see PAGE_INVENTORY.md
        // for the five sections deliberately not built this pass.
        path: 'reports',
        loadComponent: () => import('./experiences/platform/reports/reports-page').then((m) => m.ReportsPage),
      },
      {
        path: 'reports/:id',
        loadComponent: () =>
          import('./experiences/platform/reports/workshop-usage-page').then((m) => m.WorkshopUsagePage),
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
    loadComponent: () => import('./experiences/branch-manager/shell/branch-shell').then((m) => m.BranchShell),
    children: [
      // The branch manager's landing page: "what needs me?" answered with
      // no click, filter or memory of where they were. Everything else in
      // the role is reached from here.
      { path: '', pathMatch: 'full', redirectTo: 'attention' },
      {
        path: 'attention',
        loadComponent: () =>
          import('./experiences/branch-manager/attention-center/attention-center').then((m) => m.AttentionCenter),
      },
      {
        path: 'intake',
        loadComponent: () => import('./experiences/branch-manager/intake/intake-page').then((m) => m.IntakePage),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./experiences/branch-manager/approvals/approvals-page').then((m) => m.ApprovalsPage),
      },
      {
        path: 'delivery',
        loadComponent: () => import('./experiences/branch-manager/approvals/delivery-page').then((m) => m.DeliveryPage),
      },
      {
        // Reached from Delivery, where the balance is what holds a car.
        path: 'payments/:id',
        loadComponent: () => import('./experiences/finance/take-payment').then((m) => m.TakePayment),
      },
      {
        // Reachable only where the owner has delegated team management.
        // The route always exists; the page itself says so when it has
        // not been, which is better than a 404 that looks like a bug.
        path: 'team',
        loadComponent: () => import('./experiences/branch-manager/team/team-setup-page').then((m) => m.TeamSetupPage),
      },
      {
        path: 'work-orders',
        loadComponent: () =>
          import('./experiences/branch-manager/work-orders/work-orders-board').then((m) => m.WorkOrdersBoard),
      },
      {
        // `id` binds to the component's input of the same name --
        // withComponentInputBinding() is on in app.config.
        path: 'work-orders/:id',
        loadComponent: () =>
          import('./experiences/branch-manager/work-orders/work-order-workspace').then((m) => m.WorkOrderWorkspace),
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
    loadComponent: () => import('./experiences/owner/shell/owner-shell').then((m) => m.OwnerShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./experiences/owner/owner-home-page').then((m) => m.OwnerHomePage),
      },
      {
        path: 'audit',
        loadComponent: () => import('./experiences/owner/audit-page').then((m) => m.AuditPage),
      },
      {
        // Staff / Branches / Warehouses tabs.
        path: 'organization',
        loadComponent: () =>
          import('./experiences/owner/organization/organization-page').then((m) => m.OrganizationPage),
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
          import('./experiences/branch-manager/team/team-setup-page').then((m) => m.TeamSetupPage),
        data: { teamsForOwner: true },
        // Re-providing TeamApi itself (not just the token) forces a fresh
        // instance scoped to this route, so it actually picks up the
        // overridden token instead of reusing the root singleton that
        // may already have resolved to the Branch Manager's path.
        providers: [{ provide: TEAM_API_BASE_PATH, useValue: '/api/v1/organization/teams' }, TeamApi],
      },
      {
        path: 'messages',
        loadComponent: () => import('./experiences/owner/messages/messages-page').then((m) => m.MessagesPage),
      },
      {
        path: 'forms',
        loadComponent: () => import('./experiences/owner/forms/forms-page').then((m) => m.FormsPage),
      },
      {
        path: 'pricing',
        loadComponent: () => import('./experiences/owner/pricing/pricing-page').then((m) => m.PricingPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./experiences/owner/reports/reports-page').then((m) => m.ReportsPage),
      },
      {
        path: 'workflow-health',
        loadComponent: () =>
          import('./experiences/owner/workflow-health/workflow-health-page').then((m) => m.WorkflowHealthPage),
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
      import('./experiences/team-leader/shell/team-leader-shell').then((m) => m.TeamLeaderShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./experiences/team-leader/team-leader-home').then((m) => m.TeamLeaderHome),
      },
      {
        path: 'technicians',
        loadComponent: () => import('./experiences/team-leader/technicians-page').then((m) => m.TechniciansPage),
      },
      {
        path: 'work-orders',
        loadComponent: () => import('./experiences/team-leader/team-work-orders').then((m) => m.TeamWorkOrders),
      },
      {
        path: 'reports',
        loadComponent: () => import('./experiences/team-leader/team-reports').then((m) => m.TeamReports),
      },
    ],
  },
  {
    // The Customer Portal shell -- bottom nav like the technician shell,
    // for the same reason (a phone held one-handed), though the two
    // personas are otherwise unrelated. See docs/phases/PHASE_11.md.
    path: 'customer',
    canActivate: [authGuard],
    loadComponent: () => import('./experiences/customer/shell/customer-shell').then((m) => m.CustomerShell),
    children: [
      { path: '', loadComponent: () => import('./experiences/customer/portal-home').then((m) => m.PortalHome) },
      { path: 'assets', loadComponent: () => import('./experiences/customer/my-assets').then((m) => m.MyAssets) },
      {
        path: 'service',
        loadComponent: () => import('./experiences/customer/current-service').then((m) => m.CurrentService),
      },
      {
        // The authenticated way to answer what the workshop asked. The
        // token link at /decide/:token still works and always will --
        // this is the other end of the same feature, for a customer who
        // no longer has the message.
        path: 'decisions',
        loadComponent: () => import('./experiences/customer/my-decisions').then((m) => m.MyDecisions),
      },
      {
        path: 'invoices',
        loadComponent: () => import('./experiences/customer/invoice-status').then((m) => m.InvoiceStatus),
      },
      { path: 'history', loadComponent: () => import('./experiences/customer/safe-history').then((m) => m.SafeHistory) },
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
      import('./experiences/inventory/shell/inventory-shell').then((m) => m.InventoryShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        // The spec's default landing page for this role: daily triage
        // before anything else, the storekeeper's Attention Center.
        path: 'home',
        loadComponent: () => import('./experiences/inventory/inventory-home').then((m) => m.InventoryHomePage),
      },
      {
        path: 'catalog',
        loadComponent: () => import('./experiences/inventory/inventory-catalog').then((m) => m.InventoryCatalog),
      },
      {
        path: 'reports',
        loadComponent: () => import('./experiences/inventory/inventory-reports').then((m) => m.InventoryReportsPage),
      },
      {
        path: 'requests',
        loadComponent: () => import('./experiences/inventory/inventory-requests').then((m) => m.InventoryRequests),
      },
      {
        path: 'stock',
        loadComponent: () => import('./experiences/inventory/inventory-stock').then((m) => m.InventoryStock),
      },
      {
        path: 'items/:id',
        loadComponent: () => import('./experiences/inventory/inventory-item').then((m) => m.InventoryItem),
      },
      {
        path: 'returns',
        loadComponent: () => import('./experiences/inventory/inventory-returns').then((m) => m.InventoryReturns),
      },
    ],
  },
  {
    // The technician's own shell: three pages, no admin sidebar, and a
    // density layer built for a gloved hand. See docs/phases/PHASE_6.md.
    path: 'tech',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./experiences/technician/shell/technician-shell').then((m) => m.TechnicianShell),
    children: [
      { path: '', loadComponent: () => import('./experiences/technician/tech-now').then((m) => m.TechNow) },
      { path: 'work', loadComponent: () => import('./experiences/technician/tech-my-work').then((m) => m.TechMyWork) },
      {
        path: 'card/:id',
        loadComponent: () => import('./experiences/technician/tech-work-card').then((m) => m.TechWorkCard),
      },
    ],
  },
  {
    // The Data Analyst's shell -- a rail, like Inventory/Owner. Seven
    // pages per docs/detailed-specs/data-analyst.md; saved views persist
    // this analyst's own report configuration, never operational data.
    path: 'analyst',
    canActivate: [authGuard],
    loadComponent: () => import('./experiences/analyst/shell/analyst-shell').then((m) => m.AnalystShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./experiences/analyst/analyst-home-page').then((m) => m.AnalystHomePage),
      },
      {
        path: 'operations',
        loadComponent: () =>
          import('./experiences/analyst/analyst-operations-page').then((m) => m.AnalystOperationsPage),
      },
      {
        path: 'people',
        loadComponent: () => import('./experiences/analyst/analyst-people-page').then((m) => m.AnalystPeoplePage),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./experiences/analyst/analyst-inventory-page').then((m) => m.AnalystInventoryPage),
      },
      {
        path: 'decisions',
        loadComponent: () =>
          import('./experiences/analyst/analyst-decisions-page').then((m) => m.AnalystDecisionsPage),
      },
      {
        path: 'feature-adoption',
        loadComponent: () =>
          import('./experiences/analyst/analyst-feature-adoption-page').then((m) => m.AnalystFeatureAdoptionPage),
      },
      {
        path: 'saved-views',
        loadComponent: () =>
          import('./experiences/analyst/analyst-saved-views-page').then((m) => m.AnalystSavedViewsPage),
      },
    ],
  },
  {
    // The fallback frame, for roles whose own shell is not built yet.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./experiences/home/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./experiences/home/placeholder-home').then((m) => m.PlaceholderHome) },
    ],
  },
  { path: '**', redirectTo: '' },
];
