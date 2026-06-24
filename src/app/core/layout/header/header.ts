import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../auth/auth';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  readonly menuOpened = output<void>();
  protected readonly user = this.auth.user;
  protected logout(): void { this.auth.logout(); void this.router.navigate(['/login']); }
}
