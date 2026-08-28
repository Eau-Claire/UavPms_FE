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

    const userRole = (user.role || '').toLowerCase();
    const hasRole = allowedRoles.some((role) => {
      const target = role.toLowerCase();
      if (target === 'admin' || target === 'systemadmin') {
        return (
          userRole === 'admin' ||
          userRole === 'systemadmin' ||
          userRole === 'administrator'
        );
      }
      if (target === 'manager' || target === 'supervisor') {
        return userRole === 'manager' || userRole === 'supervisor';
      }
      if (target === 'technician' || target === 'maintenancetechnician') {
        return userRole === 'technician' || userRole === 'maintenancetechnician';
      }
      if (target === 'inspector') {
        return userRole === 'inspector' || userRole === 'pilot';
      }
      return userRole === target;
    });

    if (hasRole) {
      return true;
    }

    // Unauthorized - redirect to dedicated Access Denied (403) page
    return router.createUrlTree(['/403']);
  };
};
