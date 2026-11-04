import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../../models/auth.models';
import { Auth } from './auth';
import { canAccess } from './route-access';

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

    if (canAccess(user.role, allowedRoles)) {
      return true;
    }

    // Unauthorized - redirect to dedicated Access Denied (403) page
    return router.createUrlTree(['/403']);
  };
};
