import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Observable, catchError, map, of } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isAnalystRole, isManagerRole } from '../../../../core/auth/roles';
import { Mission } from '../../../../models/missions.models';
import { InspectionFilters as Filters } from '../../../../models/monitor.models';
import { MissionsApi } from '../../../missions/data-access/missions-api';
import { GUID_PATTERN } from '../../data-access/monitor-api';

export interface MissionOption {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly label: string;
}

/** What the filter bar emits: server-side filters plus an optional free-text mission search applied on the client. */
export interface InspectionFilterChange {
  readonly filters: Filters;
  /** Non-empty when the mission text matched neither a known mission nor a GUID: filter the loaded page by name. */
  readonly missionSearch: string;
  /** The picked mission's "code — title", when the text resolved to a mission. */
  readonly missionLabel: string;
}

const optionLabel = (code: string, title: string): string => (title ? `${code} — ${title}` : code);

/** Resolves the mission text to a mission id: a GUID typed directly, or an option matched by label, code or title. */
export const resolveMissionInput = (text: string, options: readonly MissionOption[]): { id: string; label: string } | null => {
  const value = text.trim();
  if (!value) return null;
  if (GUID_PATTERN.test(value)) {
    const known = options.find((o) => o.id.toLowerCase() === value.toLowerCase());
    return { id: value, label: known?.label ?? value };
  }
  const lower = value.toLocaleLowerCase('vi');
  const match =
    options.find((o) => o.label.toLocaleLowerCase('vi') === lower) ??
    options.find((o) => o.code.toLocaleLowerCase('vi') === lower) ??
    options.find((o) => o.title.toLocaleLowerCase('vi') === lower);
  return match ? { id: match.id, label: match.label } : null;
};

@Component({
  selector: 'app-inspection-filters',
  imports: [ReactiveFormsModule],
  templateUrl: './inspection-filters.html',
  styleUrl: './inspection-filters.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectionFilters {
  private readonly fb = inject(FormBuilder);
  private readonly missionsApi = inject(MissionsApi);
  private readonly role = inject(Auth).user()?.role;

  readonly filtersChanged = output<InspectionFilterChange>();

  protected readonly form = this.fb.nonNullable.group({ mission: '', defectStatus: 'all', fromDate: '', toDate: '' });
  /** Missions offered in the picker: the latest 100 missions for Admin/Manager/Analyst (`GET /missions`), otherwise my own. */
  protected readonly missionOptions = signal<readonly MissionOption[]>([]);

  constructor() {
    this.loadMissionOptions()
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((options) => this.missionOptions.set(options));
  }

  protected apply(): void {
    const value = this.form.getRawValue();
    const missionText = value.mission.trim();
    const resolved = resolveMissionInput(missionText, this.missionOptions());
    this.filtersChanged.emit({
      filters: {
        missionId: resolved?.id ?? '',
        isDefect: value.defectStatus === 'all' ? null : value.defectStatus === 'defect',
        fromDate: value.fromDate,
        toDate: value.toDate,
        page: 1,
        pageSize: 10,
      },
      missionSearch: resolved ? '' : missionText,
      missionLabel: resolved?.label ?? '',
    });
  }

  protected clear(): void {
    this.form.reset();
    this.apply();
  }

  private loadMissionOptions(): Observable<readonly MissionOption[]> {
    const source: Observable<readonly Mission[]> =
      isManagerRole(this.role) || isAnalystRole(this.role)
        ? this.missionsApi.list({ page: 1, pageSize: 100, sortBy: 'createdAt', sortDescending: true }).pipe(map((page) => page.items))
        : this.missionsApi.my();
    return source.pipe(
      map((missions) =>
        missions
          .filter((m) => m.id)
          .map((m): MissionOption => {
            const code = m.missionCode || m.id;
            return { id: m.id, code, title: m.title, label: optionLabel(code, m.title) };
          }),
      ),
      catchError(() => of<readonly MissionOption[]>([])),
    );
  }
}
