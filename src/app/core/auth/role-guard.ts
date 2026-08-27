import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../../models/auth.models';
import { Auth } from './auth';

export const roleGuard = (allowedRoles: readonly UserRole[]): CanActivateFn => {
  return (_route, state) => {
    const auth = inject(Auth);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    const user = auth.user();
    if (!user) {
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
    }

    // Role matching check
    const hasRole = allowedRoles.some(
      (role) => role.toLowerCase() === (user.role || '').toLowerCase(),
    );

    if (hasRole) {
      return true;
    }

    // Unauthorized - return to dashboard with forbidden notice
    return router.createUrlTree(['/dashboard'], { queryParams: { error: 'forbidden' } });
  };
};
