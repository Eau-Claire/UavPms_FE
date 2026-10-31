import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  CreateMissionFromAssessmentRequest,
  InspectionObjective,
  MissionPersonnelAssignment,
  MissionPriority,
  PRIORITY_DEFECT_CATEGORIES,
} from '../../../../models/missions.models';
import { PersonnelCandidate, PreMissionAssessment, UavCandidate } from '../../../../models/pre-mission.models';
import { generateGuid, PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { isValidGuid } from '../../data-access/missions-api';

const ROLE_ORDER: Record<string, number> = { INSPECTOR: 0, ANALYST: 1, TECHNICIAN: 2 };

const ROLE_LABELS: Record<string, string> = {
  INSPECTOR: 'Phi công / Inspector',
  ANALYST: 'Chuyên viên phân tích',
  TECHNICIAN: 'Kỹ thuật viên',
};

/**
 * Tạo nhiệm vụ bay (MF02). Backend chỉ cho tạo nhiệm vụ từ hồ sơ đánh giá tiền khả thi ở trạng thái READY
 * (`POST /pre-mission-assessments/{id}/create-mission`). Nhân sự và drone phải chọn trong danh sách ứng viên
 * đủ điều kiện của chính hồ sơ đó.
 */
@Component({
  selector: 'app-mission-create',
  imports: [ReactiveFormsModule, RouterLink, NzIconModule, DatePipe],
  templateUrl: './mission-create.html',
  styleUrl: './mission-create.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionCreate {
  private readonly preMissionApi = inject(PreMissionApi);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly defectCategories = PRIORITY_DEFECT_CATEGORIES;

  protected readonly readyAssessments = signal<readonly PreMissionAssessment[]>([]);
  protected readonly loadingList = signal(false);
  protected readonly assessment = signal<PreMissionAssessment | null>(null);
  protected readonly loadingAssessment = signal(false);
  protected readonly refreshingReadiness = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly selectedPersonnelIds = signal<readonly string[]>([]);
  protected readonly selectedDroneIds = signal<readonly string[]>([]);
  protected readonly selectedPriorityDefects = signal<readonly string[]>([]);
  private readonly priority = signal<MissionPriority>('NORMAL');

  /** Khóa idempotency cố định cho một lần mở form để tránh tạo trùng khi bấm lại. */
  private idempotencyKey = generateGuid();

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5)]],
    description: [''],
    priority: ['NORMAL' as MissionPriority],
    objective: ['PERIODIC_INSPECTION' as InspectionObjective],
    emergencyReason: [''],
    isImmediate: [false],
  });

  protected readonly isAssessmentUsable = computed(() => {
    const a = this.assessment();
    return !!a && a.status === 'READY' && !a.completedMissionId && !isExpired(a);
  });

  protected readonly eligiblePersonnel = computed<readonly PersonnelCandidate[]>(() =>
    [...(this.assessment()?.personnelCandidates ?? [])]
      .filter((p) => p.isEligible)
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name)),
  );

  protected readonly ineligiblePersonnelCount = computed(
    () => (this.assessment()?.personnelCandidates ?? []).filter((p) => !p.isEligible).length,
  );

  protected readonly eligibleDrones = computed<readonly UavCandidate[]>(() =>
    (this.assessment()?.uavCandidates ?? []).filter((d) => d.isEligible),
  );

  protected readonly ineligibleDroneCount = computed(
    () => (this.assessment()?.uavCandidates ?? []).filter((d) => !d.isEligible).length,
  );

  protected readonly selectedPersonnel = computed(() => {
    const ids = new Set(this.selectedPersonnelIds());
    return this.eligiblePersonnel().filter((p) => ids.has(p.id));
  });

  protected readonly hasSelectedInspector = computed(() => this.selectedPersonnel().some((p) => p.role === 'INSPECTOR'));

  protected readonly primaryDrone = computed(() => {
    const firstId = this.selectedDroneIds()[0];
    return this.eligibleDrones().find((d) => d.id === firstId) ?? null;
  });

  protected readonly isEmergency = computed(() => this.priority() === 'EMERGENCY');

  protected readonly readyAssessmentIds = computed(() => new Set(this.readyAssessments().map((a) => a.id)));

  constructor() {
    this.form.controls.priority.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.onPriorityChange(value));

    const assessmentId = this.route.snapshot.queryParamMap.get('assessmentId');
    if (assessmentId && isValidGuid(assessmentId)) {
      this.selectAssessment(assessmentId);
    }
    this.loadReadyAssessments();
  }

  protected onAssessmentSelect(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (!id) {
      this.assessment.set(null);
      this.resetSelections();
      return;
    }
    this.selectAssessment(id);
  }

  protected togglePersonnel(id: string): void {
    this.selectedPersonnelIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected toggleDrone(id: string): void {
    this.selectedDroneIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected setPrimaryDrone(id: string): void {
    this.selectedDroneIds.update((ids) => [id, ...ids.filter((x) => x !== id)]);
  }

  protected toggleDefect(key: string): void {
    this.selectedPriorityDefects.update((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  }

  protected isPersonnelSelected(id: string): boolean {
    return this.selectedPersonnelIds().includes(id);
  }

  protected isDroneSelected(id: string): boolean {
    return this.selectedDroneIds().includes(id);
  }

  protected isDefectSelected(key: string): boolean {
    return this.selectedPriorityDefects().includes(key);
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  /** Đánh giá lại nguồn lực của hồ sơ (`GET /resource-readiness`) để lấy danh sách ứng viên mới nhất. */
  protected refreshReadiness(): void {
    const a = this.assessment();
    if (!a || this.refreshingReadiness()) return;
    this.refreshingReadiness.set(true);
    this.error.set('');
    this.preMissionApi
      .getResourceReadiness(a.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.refreshingReadiness.set(false)),
      )
      .subscribe({
        next: (readiness) => {
          this.assessment.set({
            ...a,
            status: readiness.status,
            personnelCandidates: readiness.personnelCandidates,
            uavCandidates: readiness.uavCandidates,
          });
          this.pruneSelections();
          if (!readiness.isReady) {
            this.error.set('Sau khi đánh giá lại, hồ sơ không còn ở trạng thái READY. Vui lòng xử lý tại không gian đánh giá.');
          }
        },
        error: (err: unknown) => this.error.set(errorMessage(err, 'Không thể đánh giá lại mức sẵn sàng nguồn lực.')),
      });
  }

  protected submit(): void {
    this.error.set('');
    const a = this.assessment();
    if (!a) {
      this.error.set('Vui lòng chọn một hồ sơ đánh giá tiền khả thi ở trạng thái READY.');
      return;
    }
    if (!this.isAssessmentUsable()) {
      this.error.set('Hồ sơ đánh giá đã hết hạn, đã tạo nhiệm vụ hoặc chưa ở trạng thái READY.');
      return;
    }
    const f = this.form.getRawValue();
    if (f.priority === 'EMERGENCY' && f.emergencyReason.trim().length < 10) {
      this.form.controls.emergencyReason.markAsTouched();
      this.error.set('Lý do khẩn cấp bắt buộc nhập tối thiểu 10 ký tự khi chọn mức ưu tiên Khẩn cấp.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Vui lòng nhập tên nhiệm vụ (tối thiểu 5 ký tự) và các trường bắt buộc.');
      return;
    }
    const personnel = this.selectedPersonnel();
    if (!personnel.length) {
      this.error.set('Vui lòng chọn ít nhất một nhân sự từ danh sách ứng viên của hồ sơ.');
      return;
    }
    if (!this.hasSelectedInspector()) {
      this.error.set('Cần chọn ít nhất một Phi công / Inspector phụ trách nhiệm vụ.');
      return;
    }
    if (!this.selectedDroneIds().length) {
      this.error.set('Vui lòng chọn ít nhất một drone từ danh sách ứng viên của hồ sơ.');
      return;
    }

    // Người đầu tiên là Inspector chính (backend lấy Personnel[0] làm người phụ trách).
    const orderedPersonnel: MissionPersonnelAssignment[] = [...personnel]
      .sort((x, y) => (ROLE_ORDER[x.role] ?? 9) - (ROLE_ORDER[y.role] ?? 9))
      .map((p) => ({ userId: p.id, role: p.role, isRequired: true }));

    const request: CreateMissionFromAssessmentRequest = {
      assessmentId: a.id,
      title: f.title.trim(),
      description: f.description.trim() || null,
      personnel: orderedPersonnel,
      droneIds: [...this.selectedDroneIds()],
      priority: f.priority,
      objective: f.objective,
      priorityDefects: this.selectedPriorityDefects().length ? [...this.selectedPriorityDefects()] : null,
      emergencyReason: f.priority === 'EMERGENCY' ? f.emergencyReason.trim() : null,
      isImmediate: f.isImmediate,
      idempotencyKey: this.idempotencyKey,
    };

    this.busy.set(true);
    this.preMissionApi
      .createMission(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (mission) => {
          if (mission.id) {
            void this.router.navigate(['/missions', mission.id], { queryParams: { created: 'true' } });
          } else {
            void this.router.navigate(['/missions']);
          }
        },
        error: (err: unknown) => this.error.set(errorMessage(err, 'Không thể tạo nhiệm vụ từ hồ sơ đánh giá. Vui lòng thử lại.')),
      });
  }

  private selectAssessment(id: string): void {
    this.loadingAssessment.set(true);
    this.error.set('');
    this.resetSelections();
    this.preMissionApi
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingAssessment.set(false)),
      )
      .subscribe({
        next: (a) => {
          this.assessment.set(a);
          this.idempotencyKey = generateGuid();
          if (!this.form.controls.title.value) {
            this.form.controls.title.setValue(`Kiểm tra ${a.regionName || 'khu vực'} [${a.assessmentCode}]`);
          }
          if (!this.isAssessmentUsable()) {
            this.error.set(
              a.completedMissionId
                ? 'Hồ sơ này đã được dùng để tạo nhiệm vụ.'
                : 'Hồ sơ này chưa ở trạng thái READY hoặc đã hết hạn hiệu lực, không thể tạo nhiệm vụ.',
            );
          }
          this.preselectDefaults();
        },
        error: (err: unknown) => {
          this.assessment.set(null);
          this.error.set(errorMessage(err, 'Không thể tải hồ sơ đánh giá tiền khả thi.'));
        },
      });
  }

  private loadReadyAssessments(): void {
    this.loadingList.set(true);
    this.preMissionApi
      .list({ status: 'READY', page: 1, pageSize: 100 })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingList.set(false)),
      )
      .subscribe({
        next: (page) => this.readyAssessments.set(page.items.filter((a) => !a.completedMissionId && !isExpired(a))),
        error: () => this.readyAssessments.set([]),
      });
  }

  /** Chọn sẵn mỗi vai trò một người và drone đầu tiên đủ điều kiện để người dùng chỉnh lại. */
  private preselectDefaults(): void {
    const byRole = new Map<string, string>();
    for (const p of this.eligiblePersonnel()) {
      if (!byRole.has(p.role) && p.role in ROLE_ORDER) byRole.set(p.role, p.id);
    }
    this.selectedPersonnelIds.set([...byRole.values()]);
    const firstDrone = this.eligibleDrones().find((d) => d.operationalStatus === 'Available') ?? this.eligibleDrones()[0];
    this.selectedDroneIds.set(firstDrone ? [firstDrone.id] : []);
  }

  private pruneSelections(): void {
    const personnelIds = new Set(this.eligiblePersonnel().map((p) => p.id));
    const droneIds = new Set(this.eligibleDrones().map((d) => d.id));
    this.selectedPersonnelIds.update((ids) => ids.filter((id) => personnelIds.has(id)));
    this.selectedDroneIds.update((ids) => ids.filter((id) => droneIds.has(id)));
  }

  private resetSelections(): void {
    this.selectedPersonnelIds.set([]);
    this.selectedDroneIds.set([]);
  }

  private onPriorityChange(value: MissionPriority): void {
    this.priority.set(value);
    const control = this.form.controls.emergencyReason;
    if (value === 'EMERGENCY') {
      control.setValidators([Validators.required, Validators.minLength(10)]);
    } else {
      control.clearValidators();
      control.setValue('');
    }
    control.updateValueAndValidity();
  }
}

function isExpired(a: PreMissionAssessment): boolean {
  return !!a.validUntil && new Date(a.validUntil).getTime() <= Date.now();
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error && typeof err.error === 'object' ? (err.error as Record<string, unknown>) : {};
    const message = body['message'] ?? body['detail'] ?? body['title'];
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
