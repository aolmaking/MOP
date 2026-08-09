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
    ],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./features/home/placeholder-home').then((m) => m.PlaceholderHome) },
      {
        path: 'branch',
        children: [
          // The branch manager's landing page: "what needs me?" answered
          // with no click, filter or memory of where they were. Everything
          // else in the role is reached from here.
          { path: '', pathMatch: 'full', redirectTo: 'attention' },
          {
            path: 'attention',
            loadComponent: () =>
              import('./features/branch-manager/attention-center/attention-center').then((m) => m.AttentionCenter),
          },
          // Work Order Workspace is 5.D. Queue rows already link here, so
          // the route is declared but not yet built -- the same mid-phase
          // pattern as the platform rail's Workshops link.
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
