import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { GisApi, GisTower, GisTransmissionLine } from '../../../gis/data-access/gis-api';
import { PreMissionApi } from '../../data-access/pre-mission-api';

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateWindowValidator(control: AbstractControl): ValidationErrors | null {
  const start = control.get('plannedStart')?.value;
  const end = control.get('plannedEnd')?.value;
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (endDate <= startDate) {
    return { endBeforeStart: true };
  }
  return null;
}

function notObsoleteWindowValidator(control: AbstractControl): ValidationErrors | null {
  const start = control.get('plannedStart')?.value;
  if (!start) return null;
  const startDate = new Date(start);
  const now = new Date();
  // Allow 15 minutes buffer for clock skew
  if (startDate.getTime() < now.getTime() - 15 * 60 * 1000) {
    return { startInPast: true };
  }
  return null;
}

@Component({
  selector: 'app-assessment-create',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule, DatePipe],
  templateUrl: './assessment-create.html',
  styleUrl: './assessment-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssessmentCreate {
  private readonly api = inject(PreMissionApi);
  private readonly gisApi = inject(GisApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly loadingGis = signal(false);
  protected readonly error = signal('');

  protected readonly regions = signal<readonly { id: string; name: string }[]>([]);
  protected readonly availableLines = signal<readonly GisTransmissionLine[]>([]);
  protected readonly availableTowers = signal<readonly GisTower[]>([]);
  protected readonly selectedTowerCodes = signal<string[]>([]);

  // Default time window in LOCAL time: starting in 1 hour, ending in 4 hours
  private readonly defaultStart = formatDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000));
  private readonly defaultEnd = formatDatetimeLocal(new Date(Date.now() + 4 * 60 * 60 * 1000));

  protected readonly form = this.fb.nonNullable.group(
    {
      regionId: ['', [Validators.required]],
      lineName: [''],
      scopeAssetIds: ['', [Validators.required]],
      plannedStart: [this.defaultStart, [Validators.required]],
      plannedEnd: [this.defaultEnd, [Validators.required]],
    },
    { validators: [dateWindowValidator, notObsoleteWindowValidator] }
  );

  protected readonly selectedRegionObj = computed(() => {
    const id = this.form.controls.regionId.value;
    return this.regions().find((r) => r.id === id || r.name === id);
  });

  protected readonly filteredTowers = computed(() => {
    const line = this.form.controls.lineName.value;
    const all = this.availableTowers();
    if (!line) return all.slice(0, 20);
    return all.filter((t) => t.transmissionLineName === line || t.lineAssetId === line).slice(0, 30);
  });

  protected get assetCount(): number {
    const val = this.form.controls.scopeAssetIds.value;
    if (!val) return 0;
    return val.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).length;
  }

  constructor() {
    this.loadRegions();
  }

  private loadRegions(): void {
    this.gisApi.getRegions().subscribe({
      next: (list) => this.regions.set(list),
      error: (err) => console.warn('Failed to load regions', err),
    });
  }

  protected onRegionSelect(regionId: string): void {
    this.form.controls.regionId.setValue(regionId);
    this.form.controls.lineName.setValue('');
    this.form.controls.scopeAssetIds.setValue('');
    this.selectedTowerCodes.set([]);

    if (!regionId) {
      this.availableLines.set([]);
      this.availableTowers.set([]);
      return;
    }

    this.loadingGis.set(true);
    this.gisApi.getAllGisData({ administrativeAreaId: regionId }).subscribe({
      next: (snapshot) => {
        this.availableLines.set(snapshot.lines);
        this.availableTowers.set(snapshot.towers);
        this.loadingGis.set(false);
      },
      error: (err) => {
        console.warn('Failed to load GIS data', err);
        this.loadingGis.set(false);
      },
    });
  }

  protected onLineSelect(lineName: string): void {
    this.form.controls.lineName.setValue(lineName);
    if (!lineName) return;

    // Auto-populate all towers of selected line
    const lineTowers = this.availableTowers().filter(
      (t) => t.transmissionLineName === lineName || t.lineAssetId === lineName
    );
    if (lineTowers.length > 0) {
      const codes = lineTowers.map((t) => t.towerCode);
      this.selectedTowerCodes.set(codes);
      this.form.controls.scopeAssetIds.setValue(codes.join(', '));
    }
  }

  protected toggleTowerSelection(code: string): void {
    const current = new Set(this.selectedTowerCodes());
    if (current.has(code)) {
      current.delete(code);
    } else {
      current.add(code);
    }
    const arr = Array.from(current);
    this.selectedTowerCodes.set(arr);
    this.form.controls.scopeAssetIds.setValue(arr.join(', '));
  }

  protected isTowerSelected(code: string): boolean {
    return this.selectedTowerCodes().includes(code);
  }

  protected selectAllFilteredTowers(): void {
    const towers = this.filteredTowers();
    const current = new Set(this.selectedTowerCodes());
    towers.forEach((t) => current.add(t.towerCode));
    const arr = Array.from(current);
    this.selectedTowerCodes.set(arr);
    this.form.controls.scopeAssetIds.setValue(arr.join(', '));
  }

  protected clearTowerSelection(): void {
    this.selectedTowerCodes.set([]);
    this.form.controls.scopeAssetIds.setValue('');
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');

    const raw = this.form.getRawValue();
    const assetIds = raw.scopeAssetIds
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (assetIds.length === 0) {
      this.error.set('Vui lòng nhập hoặc chọn ít nhất một mã vị trí/thiết bị cột điện (Asset ID).');
      this.busy.set(false);
      return;
    }

    this.api
      .create({
        regionId: raw.regionId.trim(),
        lineName: raw.lineName.trim() || undefined,
        plannedStart: raw.plannedStart,
        plannedEnd: raw.plannedEnd,
        scopeAssetIds: assetIds,
      })
      .subscribe({
        next: (created) => {
          this.router.navigate(['/pre-mission', created.id]);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            extractErrorMessage(
              err,
              'Không thể tạo đánh giá tiền nhiệm vụ. Vui lòng kiểm tra lại thông tin phạm vi và thời gian.'
            )
          );
        },
      });
  }
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as Record<string, unknown>;
  const errorObj = e['error'] as Record<string, unknown> | string | undefined;

  if (typeof errorObj === 'string' && errorObj.trim()) return errorObj;
  if (errorObj && typeof errorObj === 'object') {
    if (typeof errorObj['message'] === 'string' && errorObj['message'].trim()) {
      return errorObj['message'];
    }
    if (typeof errorObj['title'] === 'string') {
      const title = errorObj['title'];
      const errors = errorObj['errors'];
      if (errors && typeof errors === 'object') {
        const details = Object.entries(errors as Record<string, string[]>)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join('; ');
        return `${title} (${details})`;
      }
      return title;
    }
    if (typeof errorObj['detail'] === 'string' && errorObj['detail'].trim()) {
      return errorObj['detail'];
    }
  }
  if (typeof e['message'] === 'string' && e['message'].trim()) return e['message'];
  return fallback;
}
