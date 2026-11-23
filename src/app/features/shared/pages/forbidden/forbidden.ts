import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../../../core/auth/auth';
import { roleLabelVietnamese } from '../../../../shared/status/status';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  templateUrl: './forbidden.html',
  styleUrl: './forbidden.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Forbidden {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly user = computed(() => this.auth.user());
  protected readonly userRole = computed(() => roleLabelVietnamese(this.user()?.role));

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
