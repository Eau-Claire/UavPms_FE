import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  untracked,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { finalize } from 'rxjs';
import {
  AnomalyApi,
  AnomalyTowerAssignment,
  anomalyErrorMessage,
  TowerLookupItem,
  TowerSuggestions,
} from '../../data-access/anomaly-api';

/**
 * Links an anomaly to a tower (`PUT /anomalies/{id}/tower`). Offers the nearest towers from
 * `GET /anomalies/{id}/tower-suggestions` and a manual search over `GET /towers?search=`.
 */
@Component({
  selector: 'app-anomaly-tower-assignment',
  imports: [DecimalPipe, ReactiveFormsModule, NzIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tower-assign" [class.tower-assign-required]="highlight()" aria-labelledby="tower-assign-title">
      <div class="tower-assign-head">
        <h3 id="tower-assign-title" class="info-section-title">Cột điện liên kết</h3>
        @if (towerId()) {
          <span class="tower-current">
            <span nz-icon nzType="environment" aria-hidden="true"></span>
            {{ towerCode() || 'Đã gắn cột (chưa có mã)' }}
          </span>
        } @else {
          <span class="tower-missing">
            <span nz-icon nzType="warning" aria-hidden="true"></span>
            Chưa gắn cột điện
          </span>
        }
      </div>

      @if (highlight()) {
        <p class="tower-assign-hint" role="alert">
          Bất thường phải được gắn với một cột điện trước khi xác nhận. Chọn cột gợi ý bên dưới hoặc tìm theo mã cột.
        </p>
      }

      @if (!disabled()) {
        <div class="tower-assign-actions">
          <button type="button" class="tower-btn" [disabled]="suggestionsLoading() || busy()" (click)="loadSuggestions()">
            <span nz-icon [nzType]="suggestionsLoading() ? 'loading' : 'aim'" aria-hidden="true"></span>
            Gợi ý cột gần nhất
          </button>
        </div>

        @if (suggestions(); as data) {
          <p class="tower-assign-meta">
            Theo vị trí {{ data.source === 'Media' ? 'chụp của ảnh' : 'GPS của bất thường' }}
            ({{ data.latitude | number: '1.5-5' }}, {{ data.longitude | number: '1.5-5' }}), bán kính {{ data.radiusMeters }} m.
          </p>
          @if (data.towers.length) {
            <ul class="tower-list" aria-label="Cột điện gợi ý">
              @for (tower of data.towers; track tower.towerId) {
                <li class="tower-row">
                  <div class="tower-row-info">
                    <strong>{{ tower.towerCode }}</strong>
                    <small>
                      {{ tower.distanceMeters | number: '1.0-1' }} m
                      @if (tower.address) { · {{ tower.address }} }
                    </small>
                  </div>
                  @if (tower.towerId === towerId()) {
                    <span class="tower-tag">Đang gắn</span>
                  } @else {
                    <button
                      type="button"
                      class="tower-btn tower-btn-primary"
                      [disabled]="busy()"
                      [attr.aria-label]="'Gán cột ' + tower.towerCode"
                      (click)="assign(tower.towerId)"
                    >
                      Gán cột
                    </button>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="tower-assign-meta">Không có cột điện nào trong bán kính tìm kiếm. Hãy tìm theo mã cột.</p>
          }
        }

        <div class="tower-search">
          <label for="tower-search-input">Tìm cột theo mã</label>
          <div class="tower-search-row">
            <input
              id="tower-search-input"
              type="search"
              placeholder="Ví dụ: NPC_HP_01_001"
              [formControl]="searchControl"
              (keydown.enter)="$event.preventDefault(); search()"
            />
            <button type="button" class="tower-btn" [disabled]="searchLoading() || busy()" (click)="search()">
              <span nz-icon [nzType]="searchLoading() ? 'loading' : 'search'" aria-hidden="true"></span>
              Tìm
            </button>
          </div>
          @if (searchResults(); as results) {
            @if (results.length) {
              <ul class="tower-list" aria-label="Kết quả tìm cột điện">
                @for (tower of results; track tower.id) {
                  <li class="tower-row">
                    <div class="tower-row-info">
                      <strong>{{ tower.towerCode }}</strong>
                      <small>{{ tower.regionName || '' }}@if (tower.address) { · {{ tower.address }} }</small>
                    </div>
                    @if (tower.id === towerId()) {
                      <span class="tower-tag">Đang gắn</span>
                    } @else {
                      <button
                        type="button"
                        class="tower-btn tower-btn-primary"
                        [disabled]="busy()"
                        [attr.aria-label]="'Gán cột ' + tower.towerCode"
                        (click)="assign(tower.id)"
                      >
                        Gán cột
                      </button>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="tower-assign-meta">Không tìm thấy cột điện phù hợp.</p>
            }
          }
        </div>
      }

      @if (message(); as msg) {
        <p class="tower-assign-message" [class.is-error]="messageIsError()" role="status">{{ msg }}</p>
      }
    </section>
  `,
  styles: `
    .tower-assign { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
    .tower-assign-required { border-color: #f59e0b; background: #fffbeb; }
    .tower-assign-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .tower-assign-head .info-section-title { margin: 0; }
    .tower-current { font-weight: 700; color: #0369a1; display: inline-flex; gap: 4px; align-items: center; }
    .tower-missing { font-weight: 700; color: #b45309; display: inline-flex; gap: 4px; align-items: center; }
    .tower-assign-hint { margin: 0; font-size: 13px; color: #92400e; }
    .tower-assign-meta { margin: 0; font-size: 12px; color: #475569; }
    .tower-assign-actions { display: flex; gap: 8px; }
    .tower-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tower-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .tower-btn:focus-visible { outline: 2px solid #0284c7; outline-offset: 2px; }
    .tower-btn-primary { background: #0369a1; border-color: #0369a1; color: #fff; }
    .tower-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .tower-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
    .tower-row-info { display: grid; gap: 2px; min-width: 0; }
    .tower-row-info small { color: #475569; font-size: 12px; }
    .tower-tag { font-size: 12px; font-weight: 700; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 999px; }
    .tower-search { display: grid; gap: 6px; }
    .tower-search label { font-size: 12px; font-weight: 600; color: #334155; }
    .tower-search-row { display: flex; gap: 6px; }
    .tower-search-row input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
    .tower-assign-message { margin: 0; font-size: 13px; color: #166534; }
    .tower-assign-message.is-error { color: #b91c1c; }
  `,
})
export class AnomalyTowerAssignmentPanel {
  private readonly api = inject(AnomalyApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly anomalyId = input.required<string>();
  readonly towerId = input<string | null>(null);
  readonly towerCode = input<string | null>(null);
  readonly disabled = input(false);
  /** Set after the backend rejected a confirmation with `TOWER_REQUIRED`. */
  readonly highlight = input(false);

  readonly assigned = output<AnomalyTowerAssignment>();

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly suggestions = signal<TowerSuggestions | null>(null);
  protected readonly suggestionsLoading = signal(false);
  protected readonly searchResults = signal<readonly TowerLookupItem[] | null>(null);
  protected readonly searchLoading = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');
  protected readonly messageIsError = signal(false);

  constructor() {
    // When confirmation failed for lack of a tower, fetch suggestions right away.
    effect(() => {
      if (this.highlight() && !this.disabled() && !this.suggestions() && !this.suggestionsLoading()) {
        untracked(() => this.loadSuggestions());
      }
    });
  }

  protected loadSuggestions(): void {
    this.suggestionsLoading.set(true);
    this.message.set('');
    this.api
      .getTowerSuggestions(this.anomalyId())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.suggestionsLoading.set(false)),
      )
      .subscribe({
        next: (data) => this.suggestions.set(data),
        error: (err: unknown) => this.showMessage(anomalyErrorMessage(err, 'Không thể tải gợi ý cột điện.'), true),
      });
  }

  protected search(): void {
    const query = this.searchControl.value.trim();
    if (!query) {
      this.showMessage('Nhập mã cột điện để tìm kiếm.', true);
      return;
    }
    this.searchLoading.set(true);
    this.message.set('');
    this.api
      .searchTowers(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.searchLoading.set(false)),
      )
      .subscribe({
        next: (towers) => this.searchResults.set(towers),
        error: (err: unknown) => this.showMessage(anomalyErrorMessage(err, 'Không thể tìm cột điện.'), true),
      });
  }

  protected assign(towerId: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api
      .assignTower(this.anomalyId(), towerId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.showMessage(`Đã gán cột ${result.towerCode || ''} cho bất thường.`, false);
          this.assigned.emit(result);
        },
        error: (err: unknown) => this.showMessage(anomalyErrorMessage(err, 'Không thể gán cột điện.'), true),
      });
  }

  private showMessage(text: string, isError: boolean): void {
    this.message.set(text);
    this.messageIsError.set(isError);
  }
}
