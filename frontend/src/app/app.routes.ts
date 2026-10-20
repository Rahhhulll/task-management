import { Routes } from '@angular/router';
import { AuthPage } from './features/auth/auth-page';
import { TaskDashboard } from './features/tasks/pages/task-dashboard/task-dashboard';
import { authGuard } from './core/services/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: AuthPage,
    title: 'Sign in | Daymark',
  },
  {
    path: '',
    component: TaskDashboard,
    canActivate: [authGuard],
    title: 'Tasks | Daymark',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
