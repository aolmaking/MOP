import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

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
      // No index route yet -- Workshops (the real spec'd landing page for
      // this role) is Phase 2 step 3. Reachable by direct URL right now;
      // the left-rail's own "Workshops" link 404s harmlessly until then,
      // same as any other mid-phase page that isn't built yet.
      {
        path: 'workshops/new',
        loadComponent: () => import('./features/platform/add-workshop/add-workshop-page').then((m) => m.AddWorkshopPage),
      },
      {
        path: 'workshops/:id/capabilities',
        loadComponent: () =>
          import('./features/platform/capabilities/capabilities-page').then((m) => m.CapabilitiesPage),
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
    // The Tenant Owner shell -- the first Owner surface. History is built
    // first because AuditLog has been written since Phase 1 and read by
    // nothing; the other seven Owner pages are Phase 10.
    path: 'owner',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/owner-shell/owner-shell').then((m) => m.OwnerShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'audit' },
      {
        path: 'audit',
        loadComponent: () => import('./features/owner/audit-page').then((m) => m.AuditPage),
      },
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
