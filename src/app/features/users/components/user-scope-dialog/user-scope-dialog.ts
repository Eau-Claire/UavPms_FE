import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { RegionLookup } from '../../../../models/assets.models';
import { UserGeographicScopes, UserRecord } from '../../../../models/users.models';
import { RegionsApi } from '../../../towers/data-access/regions-api';
import { UsersApi } from '../../data-access/users-api';

/**
 * View / edit a user's default geographic scope (GET/PUT /users/{id}/geographic-scopes).
 * Only SystemAdmin and Manager may save (backend rule UserRoles.AdminAndManager); others get a read-only view.
 */
@Component({
  selector: 'app-user-scope-dialog',
  templateUrl: './user-scope-dialog.html',
  styleUrl: './user-scope-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserScopeDialog implements OnInit {
  private readonly usersApi = inject(UsersApi);
  private readonly regionsApi = inject(RegionsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly user = input.required<UserRecord>();
  readonly editable = input(false);
  readonly closed = output<void>();
  readonly saved = output<UserGeographicScopes>();

  protected readonly regions = signal<readonly RegionLookup[]>([]);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly visibleRegions = computed(() => {
    const term = this.filter().trim().toLowerCase();
    return term ? this.regions().filter((region) => region.name.toLowerCase().includes(term)) : this.regions();
  });
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly selectedNames = computed(() =>
    this.regions().filter((region) => this.selected().has(region.id)).map((region) => region.name),
  );

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ regions: this.regionsApi.getAll(), scopes: this.usersApi.getGeographicScopes(this.user().id) })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ regions, scopes }) => {
          // Keep scope regions the region list might not return (e.g. soft-deleted) so they stay visible.
          const known = new Set(regions.map((region) => region.id));
          const extra = scopes.regions
            .filter((region) => !known.has(region.regionId))
            .map((region) => ({ id: region.regionId, name: region.name || region.code || region.regionId }));
          this.regions.set([...regions, ...extra].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
          this.selected.set(new Set(scopes.regions.map((region) => region.regionId)));
        },
        error: () => this.error.set('Không thể tải phạm vi khu vực của người dùng.'),
      });
  }

  protected toggle(regionId: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(regionId);
      else next.delete(regionId);
      return next;
    });
  }

  protected selectVisible(checked: boolean): void {
    const ids = this.visibleRegions().map((region) => region.id);
    this.selected.update((current) => {
      const next = new Set(current);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  protected save(): void {
    if (!this.editable() || this.saving() || this.loading()) return;
    this.saving.set(true);
    this.error.set('');
    this.usersApi
      .setGeographicScopes(this.user().id, [...this.selected()])
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false)))
      .subscribe({
        next: (scopes) => this.saved.emit(scopes),
        error: (error: unknown) => {
          const status = Number((error as { status?: number } | null)?.status ?? 0);
          this.error.set(status === 403 ? 'Chỉ Quản trị viên hệ thống hoặc Quản lý được cập nhật phạm vi khu vực.' : 'Không thể lưu phạm vi khu vực.');
        },
      });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  protected close(): void {
    if (!this.saving()) this.closed.emit();
  }
}
