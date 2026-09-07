import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthUser } from '../../models/auth.models';
import { Auth } from './auth';
import { roleGuard } from './role-guard';

describe('roleGuard', () => {
  const setup = (mockUser: AuthUser | null) => {
    const mockAuth = {
      user: () => mockUser,
      isAuthenticated: () => Boolean(mockUser),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Auth, useValue: mockAuth },
        {
          provide: Router,
          useValue: {
            createUrlTree: vi.fn((commands, extras) => ({ commands, extras }) as unknown as UrlTree),
          },
        },
      ],
    });

    return {
      runGuard: (roles: Parameters<typeof roleGuard>[0]) =>
        TestBed.runInInjectionContext(() => roleGuard(roles)({} as never, { url: '/test' } as never)),
      router: TestBed.inject(Router),
    };
  };

  it('allows access when user has SystemAdmin role', () => {
    const { runGuard } = setup({
      id: '1',
      email: 'admin@evn.vn',
      fullName: 'Admin',
      role: 'SystemAdmin',
      mustChangePassword: false,
    });

    const result = runGuard(['SystemAdmin', 'Manager']);
    expect(result).toBe(true);
  });

  it('allows access when user has Manager role', () => {
    const { runGuard } = setup({
      id: '2',
      email: 'manager@evn.vn',
      fullName: 'Manager',
      role: 'Manager',
      mustChangePassword: false,
    });

    const result = runGuard(['SystemAdmin', 'Manager']);
    expect(result).toBe(true);
  });

  it('redirects unauthorized users to 403 page', () => {
    const { runGuard, router } = setup({
      id: '3',
      email: 'inspector@evn.vn',
      fullName: 'Inspector',
      role: 'Inspector',
      mustChangePassword: false,
    });

    runGuard(['SystemAdmin', 'Manager']);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/403']);
  });

  it('redirects unauthenticated users to login', () => {
    const { runGuard, router } = setup(null);

    runGuard(['SystemAdmin', 'Manager']);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/test' },
    });
  });
});
