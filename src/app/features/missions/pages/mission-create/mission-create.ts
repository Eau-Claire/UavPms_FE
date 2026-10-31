import { DatePipe } from '@angular/common';
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
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import { IdempotencyKeyTracker } from '../../../../shared/idempotency/idempotency-key';
import { PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { isValidGuid } from '../../data-access/missions-api';

const ROLE_ORDER: Record<string, number> = { INSPECTOR: 0, ANALYST: 1, TECHNICIAN: 2 };

const ROLE_LABELS: Record<string, string> = {
  INSPECTOR: 'Phi công / Inspector',
  ANALYST: 'Chuyên viên phân tích',
  TECHNICIAN: 'Kỹ thuật viên',
};

/** Backend default when no deadline is sent (`Mission:ConfirmationDeadlineHours`). */
const DEFAULT_DEADLINE_HOURS = 24;
export const MANAGER_INSTRUCTIONS_MAX = 2000;

/**
 * Tạo nhiệm vụ bay (MF02). Backend chỉ cho tạo nhiệm vụ từ hồ sơ đánh giá tiền khả thi ở trạng thái READY
 * (`POST /pre-mission-assessments/{id}/create-mission`). Nhân sự và drone phải chọn trong danh sách ứng viên
 * đủ điều kiện của chính hồ sơ đó. Mỗi nhiệm vụ bay đúng MỘT UAV và cần ít nhất một thành viên bắt buộc xác nhận.
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
  protected readonly instructionsMax = MANAGER_INSTRUCTIONS_MAX;

  protected readonly readyAssessments = signal<readonly PreMissionAssessment[]>([]);
  protected readonly loadingList = signal(false);
  protected readonly assessment = signal<PreMissionAssessment | null>(null);
  protected readonly loadingAssessment = signal(false);
  protected readonly refreshingReadiness = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly selectedPersonnelIds = signal<readonly string[]>([]);
  /** Members who must accept before the mission can start (`isRequired: true`). */
  protected readonly requiredPersonnelIds = signal<readonly string[]>([]);
  /** The single UAV flown by the mission (backend: `MULTIPLE_DRONES_NOT_SUPPORTED`). */
  protected readonly selectedDroneId = signal('');
  protected readonly selectedPriorityDefects = signal<readonly string[]>([]);
  private readonly priority = signal<MissionPriority>('NORMAL');

  /** Same key while an unchanged request is retried; a new key once the request changes (`IDEMPOTENCY_KEY_REUSED`). */
  private readonly idempotency = new IdempotencyKeyTracker();

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5)]],
    description: [''],
    priority: ['NORMAL' as MissionPriority],
    objective: ['PERIODIC_INSPECTION' as InspectionObjective],
    emergencyReason: [''],
    isImmediate: [false],
    /** `datetime-local` (giờ địa phương), gửi lên dạng ISO UTC. */
    confirmationDeadline: [''],
    managerInstructions: ['', [Validators.maxLength(MANAGER_INSTRUCTIONS_MAX)]],
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

  protected readonly requiredSelectedCount = computed(() => {
    const required = new Set(this.requiredPersonnelIds());
    return this.selectedPersonnel().filter((p) => required.has(p.id)).length;
  });

  protected readonly primaryDrone = computed(
    () => this.eligibleDrones().find((d) => d.id === this.selectedDroneId()) ?? null,
  );

  protected readonly isEmergency = computed(() => this.priority() === 'EMERGENCY');

  protected readonly readyAssessmentIds = computed(() => new Set(this.readyAssessments().map((a) => a.id)));

  /** Latest allowed deadline: the planned start of the assessment (local `datetime-local` value). */
  protected readonly deadlineMax = computed(() => {
    const a = this.assessment();
    const start = a ? new Date(a.plannedStart) : null;
    return start && !Number.isNaN(start.getTime()) ? toDatetimeLocal(start) : '';
  });

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
    if (this.selectedPersonnelIds().includes(id)) {
      this.selectedPersonnelIds.update((ids) => ids.filter((x) => x !== id));
      this.requiredPersonnelIds.update((ids) => ids.filter((x) => x !== id));
    } else {
      // A newly selected member is required by default; the manager can make them optional.
      this.selectedPersonnelIds.update((ids) => [...ids, id]);
      this.requiredPersonnelIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
    }
  }

  protected toggleRequired(id: string): void {
    if (!this.selectedPersonnelIds().includes(id)) return;
    this.requiredPersonnelIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected selectDrone(id: string): void {
    this.selectedDroneId.set(id);
  }

  protected toggleDefect(key: string): void {
    this.selectedPriorityDefects.update((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  }

  protected isPersonnelSelected(id: string): boolean {
    return this.selectedPersonnelIds().includes(id);
  }

  protected isPersonnelRequired(id: string): boolean {
    return this.requiredPersonnelIds().includes(id);
  }

  protected isDroneSelected(id: string): boolean {
    return this.selectedDroneId() === id;
  }

  protected isDefectSelected(key: string): boolean {
    return this.selectedPriorityDefects().includes(key);
  }

  protected roleLabel(role: string): string {
    return ROLE_LABELS[role] ?? role;
  }

  /**
   * Đánh giá lại hồ sơ (`POST /re-evaluate`) để lấy danh sách ứng viên mới nhất. `GET /resource-readiness` nay chỉ
   * đọc kết quả cũ nên không dùng để làm mới. Phản hồi là hồ sơ đầy đủ sau khi đánh giá, thay thế hồ sơ đang hiển thị.
   */
  protected refreshReadiness(): void {
    const a = this.assessment();
    if (!a || this.refreshingReadiness()) return;
    this.refreshingReadiness.set(true);
    this.error.set('');
    this.preMissionApi
      .reEvaluate(a.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.refreshingReadiness.set(false)),
      )
      .subscribe({
        next: (updated) => {
          this.assessment.set(updated);
          this.pruneSelections();
          if (updated.status !== 'READY') {
            this.error.set('Sau khi đánh giá lại, hồ sơ không còn ở trạng thái READY. Vui lòng xử lý tại không gian đánh giá.');
          }
        },
        error: (err: unknown) => this.error.set(describeHttpError(err, 'Không thể đánh giá lại mức sẵn sàng nguồn lực.')),
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
    if (f.managerInstructions.length > MANAGER_INSTRUCTIONS_MAX) {
      this.form.controls.managerInstructions.markAsTouched();
      this.error.set('Chỉ thị của quản lý tối đa 2.000 ký tự.');
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
    if (!this.requiredSelectedCount()) {
      this.error.set('Cần ít nhất một thành viên được đánh dấu "Bắt buộc xác nhận".');
      return;
    }
    const drone = this.primaryDrone();
    if (!drone) {
      this.error.set('Vui lòng chọn một UAV từ danh sách ứng viên của hồ sơ.');
      return;
    }
    const deadline = this.resolveDeadline(f.confirmationDeadline, a);
    if (deadline === false) return;

    // Người đầu tiên là Inspector chính (backend lấy Personnel[0] làm người phụ trách).
    const required = new Set(this.requiredPersonnelIds());
    const orderedPersonnel: MissionPersonnelAssignment[] = [...personnel]
      .sort((x, y) => (ROLE_ORDER[x.role] ?? 9) - (ROLE_ORDER[y.role] ?? 9))
      .map((p) => ({ userId: p.id, role: p.role, isRequired: required.has(p.id) }));

    const body: Omit<CreateMissionFromAssessmentRequest, 'idempotencyKey'> = {
      assessmentId: a.id,
      title: f.title.trim(),
      description: f.description.trim() || null,
      personnel: orderedPersonnel,
      droneIds: [drone.id],
      priority: f.priority,
      objective: f.objective,
      priorityDefects: this.selectedPriorityDefects().length ? [...this.selectedPriorityDefects()] : null,
      emergencyReason: f.priority === 'EMERGENCY' ? f.emergencyReason.trim() : null,
      isImmediate: f.isImmediate,
      confirmationDeadline: deadline,
      managerInstructions: f.managerInstructions.trim() || null,
    };
    const request: CreateMissionFromAssessmentRequest = { ...body, idempotencyKey: this.idempotency.keyFor(body) };

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
        error: (err: unknown) =>
          this.error.set(describeHttpError(err, 'Không thể tạo nhiệm vụ từ hồ sơ đánh giá. Vui lòng thử lại.')),
      });
  }

  /**
   * Validates the confirmation deadline: empty → `null` (backend default), otherwise ISO UTC. It must be in the
   * future and not after the planned start (`INVALID_CONFIRMATION_DEADLINE`). Returns `false` when invalid.
   */
  private resolveDeadline(value: string, a: PreMissionAssessment): string | null | false {
    if (!value) return null;
    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) {
      this.error.set('Hạn xác nhận không hợp lệ.');
      return false;
    }
    if (deadline.getTime() <= Date.now()) {
      this.form.controls.confirmationDeadline.markAsTouched();
      this.error.set('Hạn xác nhận phải ở tương lai.');
      return false;
    }
    const start = new Date(a.plannedStart);
    if (!Number.isNaN(start.getTime()) && deadline.getTime() > start.getTime()) {
      this.form.controls.confirmationDeadline.markAsTouched();
      this.error.set('Hạn xác nhận không được sau thời điểm bắt đầu bay dự kiến.');
      return false;
    }
    return deadline.toISOString();
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
          this.idempotency.reset();
          if (!this.form.controls.title.value) {
            this.form.controls.title.setValue(`Kiểm tra ${a.regionName || 'khu vực'} [${a.assessmentCode}]`);
          }
          this.form.controls.confirmationDeadline.setValue(defaultDeadline(a));
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
          this.error.set(describeHttpError(err, 'Không thể tải hồ sơ đánh giá tiền khả thi.'));
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

  /** Chọn sẵn mỗi vai trò một người (đều bắt buộc xác nhận) và UAV đầu tiên đủ điều kiện để người dùng chỉnh lại. */
  private preselectDefaults(): void {
    const byRole = new Map<string, string>();
    for (const p of this.eligiblePersonnel()) {
      if (!byRole.has(p.role) && p.role in ROLE_ORDER) byRole.set(p.role, p.id);
    }
    this.selectedPersonnelIds.set([...byRole.values()]);
    this.requiredPersonnelIds.set([...byRole.values()]);
    const firstDrone = this.eligibleDrones().find((d) => d.isAvailable !== false) ?? this.eligibleDrones()[0];
    this.selectedDroneId.set(firstDrone?.id ?? '');
  }

  private pruneSelections(): void {
    const personnelIds = new Set(this.eligiblePersonnel().map((p) => p.id));
    this.selectedPersonnelIds.update((ids) => ids.filter((id) => personnelIds.has(id)));
    this.requiredPersonnelIds.update((ids) => ids.filter((id) => personnelIds.has(id)));
    if (!this.eligibleDrones().some((d) => d.id === this.selectedDroneId())) this.selectedDroneId.set('');
  }

  private resetSelections(): void {
    this.selectedPersonnelIds.set([]);
    this.requiredPersonnelIds.set([]);
    this.selectedDroneId.set('');
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

/** `now + 24h`, capped at the planned start; empty when the planned start is (almost) past (backend default). */
function defaultDeadline(a: PreMissionAssessment): string {
  const now = Date.now();
  const start = new Date(a.plannedStart).getTime();
  if (Number.isNaN(start) || start <= now + 60_000) return '';
  // Rounded down to the minute by the input format, so the default never lands after the planned start.
  return toDatetimeLocal(new Date(Math.min(now + DEFAULT_DEADLINE_HOURS * 3_600_000, start)));
}

/** Local `yyyy-MM-ddTHH:mm` for `<input type="datetime-local">`. */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
