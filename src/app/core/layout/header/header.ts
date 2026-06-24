import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../auth/auth';

@Component({
  selector: 'app-header',
  imports: [NzIconModule],
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly path = signal(this.router.url);
  readonly menuOpened = output<void>();
  protected readonly user = this.auth.user;
  protected readonly menuOpen = signal(false);
  protected readonly showAssetSearch = computed(() => this.path() === '/assets');
  constructor() { this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((event) => this.path.set(event.urlAfterRedirects)); }
  protected logout(): void { this.auth.logout(); void this.router.navigate(['/login']); }
}
