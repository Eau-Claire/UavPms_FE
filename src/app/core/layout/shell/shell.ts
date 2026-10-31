import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, ViewEncapsulation } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Header } from '../header/header';
import { Sidebar } from '../sidebar/sidebar';
import { Auth } from '../../auth/auth';
import { canAccess, ROUTE_ROLES } from '../../auth/route-access';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, NzIconModule, Header, Sidebar],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly path = signal(this.router.url);
  protected readonly sidebarOpen = signal(false);
  /** `/system/audit-logs` is guarded to SystemAdmin/Manager; field roles would only reach the 403 page. */
  protected readonly canViewAuditLogs = computed(() => canAccess(this.auth.user()?.role, ROUTE_ROLES.administration));
  protected readonly isAssetRoute = computed(() => false);
  protected readonly isDashboardRoute = computed(() => {
    const p = this.path();
    return p === '/' || p === '/dashboard' || p.startsWith('/dashboard?') || p.startsWith('/?');
  });
  protected readonly isGisRoute = computed(() => {
    const p = this.path();
    return p === '/gis' || p.startsWith('/gis?') || p.startsWith('/gis/');
  });
  constructor() {
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((event) => this.path.set(event.urlAfterRedirects));
    effect(() => {
      if (!this.auth.isAuthenticated() && !this.auth.refreshing()) {
        void this.router.navigate(['/login'], { queryParams: { error: 'session_expired' } });
      }
    });
  }
}
