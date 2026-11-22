import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { ToastService } from '../../../../core/toast/toast.service';
import { SystemSettingCategory, SystemSettingItem } from '../../../../models/system-settings.models';
import { SystemSettingsApi } from '../../data-access/system-settings-api';

@Component({
  selector: 'app-system-settings',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, NzIconModule],
  templateUrl: './system-settings.html',
  styleUrl: './system-settings.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemSettingsPage implements OnInit {
  private readonly api = inject(SystemSettingsApi);
  private readonly auth = inject(Auth);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);

  protected readonly userRole = computed(() => this.auth.user()?.role);
  protected readonly canEdit = computed(() => {
    const role = (this.userRole() || '').toLowerCase();
    return role === 'admin' || role === 'systemadmin' || role === 'administrator';
  });

  protected readonly settings = signal<readonly SystemSettingItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly savingKey = signal<string | null>(null);
  protected readonly selectedCategory = signal<string>('ALL');
  protected readonly searchQuery = signal('');
  protected readonly editingItem = signal<SystemSettingItem | null>(null);
  protected readonly editValue = signal('');

  protected readonly categories: { key: string; label: string; icon: string }[] = [
    { key: 'ALL', label: 'Tất cả tham số', icon: 'appstore' },
    { key: 'AI', label: 'Trí tuệ nhân tạo (AI)', icon: 'robot' },
    { key: 'Drone', label: 'Phương tiện UAV', icon: 'rocket' },
    { key: 'Auth', label: 'Xác thực & Bảo mật', icon: 'safety' },
    { key: 'Otp', label: 'Mã OTP & Thiết bị', icon: 'mobile' },
    { key: 'Mission', label: 'Nhiệm vụ bay', icon: 'schedule' },
  ];

  protected readonly filteredSettings = computed(() => {
    const cat = this.selectedCategory();
    const query = this.searchQuery().trim().toLowerCase();
    return this.settings().filter((item) => {
      const matchCat = cat === 'ALL' || item.category === cat;
      const matchQuery = !query || item.key.toLowerCase().includes(query) || item.description.toLowerCase().includes(query) || item.value.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api
      .getAll()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.settings.set(items),
        error: () => this.toast.error('Không thể tải danh sách cấu hình hệ thống.'),
      });
  }

  protected startEdit(item: SystemSettingItem): void {
    if (!this.canEdit()) return;
    this.editingItem.set(item);
    this.editValue.set(item.value);
  }

  protected cancelEdit(): void {
    this.editingItem.set(null);
    this.editValue.set('');
  }

  protected saveEdit(): void {
    const item = this.editingItem();
    if (!item) return;
    const nextVal = this.editValue().trim();
    if (nextVal === item.value) {
      this.cancelEdit();
      return;
    }

    this.savingKey.set(item.key);
    this.api
      .update(item.key, nextVal)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.savingKey.set(null);
          this.cancelEdit();
        }),
      )
      .subscribe({
        next: () => {
          this.settings.update((list) =>
            list.map((s) => (s.key === item.key ? { ...s, value: nextVal } : s)),
          );
          this.toast.success(`Đã cập nhật tham số ${item.key} thành công!`);
        },
        error: () => this.toast.error(`Cập nhật tham số ${item.key} thất bại.`),
      });
  }

  protected categoryTone(category: SystemSettingCategory): string {
    switch (category) {
      case 'AI': return 'purple';
      case 'Drone': return 'blue';
      case 'Auth': return 'green';
      case 'Otp': return 'orange';
      case 'Mission': return 'cyan';
      default: return 'gray';
    }
  }
}

