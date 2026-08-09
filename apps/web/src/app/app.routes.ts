import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage) },
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
