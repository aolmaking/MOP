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
    ],
  },
  { path: '**', redirectTo: '' },
];
