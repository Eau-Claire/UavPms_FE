import { ChangeDetectionStrategy, Component, computed, inject, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Auth } from '../../../../core/auth/auth';

@Component({
  selector: 'app-forbidden',
  imports: [RouterLink, NzIconModule],
  templateUrl: './forbidden.html',
  styleUrl: './forbidden.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Forbidden {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly user = computed(() => this.auth.user());
  protected readonly userRole = computed(() => this.user()?.role || 'Chưa xác định');

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
