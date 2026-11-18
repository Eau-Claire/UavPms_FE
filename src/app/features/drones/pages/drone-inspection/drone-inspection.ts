import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { catchError, forkJoin, map, of } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole, isTechnicianRole } from '../../../../core/auth/roles';
import {
  BetaflightSerialService,
  SIMULATED_FC_PROFILES,
} from '../../../../core/services/betaflight-serial.service';
import {
  DroneTechnicalInspectionSummaryDto,
  UavRecord,
} from '../../../../models/drone-management.models';
import { FlightControllerResolveResult } from '../../../../models/flight-controller.models';
import {
  DroneTechnicalInspectionResult,
} from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
import { FlightControllerApi } from '../../../pre-mission/data-access/flight-controller-api';
import {
  buildInspectionChecklist,
  ChecklistPreset,
} from '../../../pre-mission/data-access/inspection-checklist';
import { PreMissionApi } from '../../../pre-mission/data-access/pre-mission-api';
import { DroneManagementApi } from '../../data-access/drone-management-api';

export type InspectionPurpose = 'PERIODIC' | 'POST_FLIGHT' | 'PRE_MISSION';

@Component({
  selector: 'app-drone-inspection',
  imports: [RouterLink, DatePipe, NzIconModule],
  templateUrl: './drone-inspection.html',
  styleUrl: './drone-inspection.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DroneInspection implements OnInit {
  private readonly api = inject(DroneManagementApi);
  private readonly preMissionApi = inject(PreMissionApi);
  private readonly fcSerial = inject(BetaflightSerialService);
  private readonly fcApi = inject(FlightControllerApi);
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentUser = this.auth.user;
  protected readonly isTechnician = computed(() => isTechnicianRole(this.currentUser()?.role));
  protected readonly isManager = computed(() => isManagerRole(this.currentUser()?.role));

  // Drone fleet state
  protected readonly drones = signal<readonly UavRecord[]>([]);
  protected readonly loadingDrones = signal<boolean>(true);
  protected readonly selectedDroneId = signal<string>('');
  protected readonly droneSearch = signal<string>('');
  protected readonly filterType = signal<'ALL' | 'ATTENTION' | 'EXPIRED'>('ALL');

  // Selected drone
  protected readonly currentDrone = computed<UavRecord | null>(() => {
    const id = this.selectedDroneId();
    const list = this.drones();
    return list.find((d) => d.id === id) || (list.length > 0 ? list[0] : null);
  });

  // Inspection Purpose
  protected readonly purpose = signal<InspectionPurpose>('PERIODIC');

  // Inspection Input State
  protected readonly mockPreset = signal<ChecklistPreset>('healthy');
  protected readonly batteryLevel = signal<number>(95);
  protected readonly gpsSats = signal<number>(24);
  protected readonly rfQuality = signal<number>(98);
  protected readonly notes = signal<string>('Kiểm định kỹ thuật định kỳ đảm bảo an toàn hành lang điện');
  protected readonly submitting = signal<boolean>(false);
  protected readonly actionMessage = signal<string>('');
  protected readonly errorMessage = signal<string>('');

  // Flight Controller (Betaflight MSP / Web Serial)
  protected readonly fcMetadata = this.fcSerial.activeMetadata;
  protected readonly fcConnectionState = this.fcSerial.connectionState;
  protected readonly fcIsSimulated = this.fcSerial.isSimulated;
  protected readonly fcError = this.fcSerial.errorMessage;
  protected readonly simulatedProfiles = SIMULATED_FC_PROFILES;
  protected readonly selectedSimProfile = signal<string>('f405-speedybee');
  protected readonly customFcUidInput = signal<string>('');
  protected readonly showCustomUidInput = signal<boolean>(false);
  protected readonly resolvingFc = signal<boolean>(false);
  protected readonly resolvedFcData = signal<FlightControllerResolveResult | null>(null);
  protected readonly pairingFc = signal<boolean>(false);
  protected readonly pairingMessage = signal<string>('');
  protected readonly activeMeasurementTab = signal<'manual' | 'fc'>('manual');

  // Inspection History of selected drone
  protected readonly historyItems = signal<readonly DroneTechnicalInspectionSummaryDto[]>([]);
  protected readonly loadingHistory = signal<boolean>(false);
  protected readonly latestInspections = signal<ReadonlyMap<string, DroneTechnicalInspectionSummaryDto>>(new Map());
  protected readonly bulkInspecting = signal<boolean>(false);

  // Status mapping
  protected readonly statusTone = statusTone;
  protected readonly statusLabel = statusLabel;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.fcSerial.disconnect().catch(() => {});
    });
  }

  ngOnInit(): void {
    this.loadDrones();
  }

  protected loadDrones(clearMessage = true): void {
    this.loadingDrones.set(true);
    this.api.getDrones({}).subscribe({
      next: (list) => {
        this.drones.set(list);
        this.loadingDrones.set(false);

        if (list.length > 0) {
          forkJoin(
            list.map((d) =>
              this.api.getTechnicalInspections(d.id, 1, 1).pipe(
                map((items) => ({ droneId: d.id, inspection: items[0] ?? null })),
                catchError(() => of({ droneId: d.id, inspection: null })),
              ),
            ),
          )
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (results) => {
                const map = new Map<string, DroneTechnicalInspectionSummaryDto>();
                for (const r of results) {
                  if (r.inspection) {
                    map.set(r.droneId, r.inspection);
                  }
                }
                this.latestInspections.set(map);
              },
            });
        }

        const currentId = this.selectedDroneId();
        const queryId = this.route.snapshot.queryParamMap.get('droneId');
        if (currentId && list.some((d) => d.id === currentId)) {
          this.selectDrone(currentId, clearMessage);
        } else if (queryId && list.some((d) => d.id === queryId)) {
          this.selectDrone(queryId, clearMessage);
        } else if (list.length > 0 && !this.selectedDroneId()) {
          this.selectDrone(list[0].id, clearMessage);
        }
      },
      error: () => {
        this.loadingDrones.set(false);
        this.errorMessage.set('Không thể tải danh sách phương tiện UAV.');
      },
    });
  }

  protected selectDrone(id: string, clearMessage = true): void {
    this.selectedDroneId.set(id);
    if (clearMessage) {
      this.actionMessage.set('');
      this.errorMessage.set('');
    }
    const drone = this.drones().find((d) => d.id === id);
    if (drone) {
      this.batteryLevel.set(drone.batteryLevel || 95);
      this.loadHistory(drone.id);
    }
  }

  protected setFilter(type: 'ALL' | 'ATTENTION' | 'EXPIRED'): void {
    this.filterType.set(type);
  }

  protected readonly filteredDrones = computed(() => {
    let list = this.drones();
    const filter = this.filterType();
    if (filter === 'ATTENTION') {
      list = list.filter((d) => {
        const badge = this.inspectionStatusBadge(d);
        return badge.tone !== 'success' || d.operationalStatus !== 'Available';
      });
    } else if (filter === 'EXPIRED') {
      list = list.filter((d) => {
        const insp = this.getLatestInspection(d.id);
        return !insp || !insp.validUntil || new Date(insp.validUntil).getTime() < Date.now();
      });
    }
    const q = this.droneSearch().trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.code.toLowerCase().includes(q) || d.model.toLowerCase().includes(q) || (d.name && d.name.toLowerCase().includes(q)));
  });

  protected setPurpose(p: InspectionPurpose): void {
    this.purpose.set(p);
    if (p === 'POST_FLIGHT') {
      this.notes.set('Cập nhật chỉ số viễn trắc kỹ thuật sau chuyến bay');
      this.batteryLevel.set(Math.min(this.batteryLevel(), 55));
    } else if (p === 'PERIODIC') {
      this.notes.set('Kiểm định kỹ thuật định kỳ đảm bảo an toàn hành lang điện');
      this.batteryLevel.set(95);
    } else {
      this.notes.set('Kiểm định kỹ thuật sẵn sàng cho hồ sơ tiền nhiệm vụ bay');
      this.batteryLevel.set(98);
    }
  }

  protected setPreset(preset: ChecklistPreset): void {
    this.mockPreset.set(preset);
    if (preset === 'healthy') {
      this.batteryLevel.set(95);
      this.gpsSats.set(24);
      this.rfQuality.set(98);
    } else if (preset === 'warning') {
      this.batteryLevel.set(38);
      this.gpsSats.set(8);
      this.rfQuality.set(65);
    } else {
      this.batteryLevel.set(18);
      this.gpsSats.set(3);
      this.rfQuality.set(35);
    }
  }

  private loadHistory(droneId: string): void {
    this.loadingHistory.set(true);
    this.api.getTechnicalInspections(droneId).subscribe({
      next: (items) => {
        this.historyItems.set(items);
        this.loadingHistory.set(false);
      },
      error: () => {
        this.historyItems.set([]);
        this.loadingHistory.set(false);
      },
    });
  }

  // Submit Technical Inspection
  protected submitInspection(): void {
    const drone = this.currentDrone();
    if (!drone || this.submitting()) return;

    this.submitting.set(true);
    this.actionMessage.set('');
    this.errorMessage.set('');

    const checklist = buildInspectionChecklist({
      preset: this.mockPreset(),
      batteryLevel: this.batteryLevel(),
      gpsSatellites: this.gpsSats(),
      rfLinkQuality: this.rfQuality(),
      flightControllerConnected: this.fcConnectionState() === 'connected',
    });

    const purposePrefix = this.purpose() === 'POST_FLIGHT' ? '[Sau chuyến bay] ' : this.purpose() === 'PERIODIC' ? '[Định kỳ] ' : '[Tiền bay] ';
    const notesText = `${purposePrefix}${this.notes().trim() || 'Biên bản kiểm định kỹ thuật UAV'}`;

    this.preMissionApi.runTechnicalInspection(drone.id, {
      notes: notesText,
      policyVersion: 'v2.0',
      flightControllerUid: this.fcMetadata()?.uid || undefined,
      metrics: checklist,
    }).subscribe({
      next: (result: DroneTechnicalInspectionResult) => {
        this.submitting.set(false);
        const pass = result.eligibility === 'ELIGIBLE' || result.status === 'Passed';
        if (pass) {
          this.actionMessage.set(`Đã hoàn tất đo kiểm kỹ thuật cho UAV ${drone.code}! Kết quả: ĐẠT TIÊU CHUẨN AN TOÀN (ELIGIBLE).`);
        } else {
          this.actionMessage.set(`Biên bản kiểm định cho UAV ${drone.code} đã được lưu: KHÔNG ĐẠT (Cần bảo dưỡng trước khi bay).`);
        }

        // Update latest inspection cache immediately
        this.latestInspections.update((m) => {
          const newMap = new Map(m);
          newMap.set(drone.id, {
            id: result.id,
            status: result.status,
            health: result.overallHealth,
            completedAt: result.inspectedAt,
            validUntil: result.validUntil,
            technicianName: result.technicianName || this.currentUser()?.fullName,
            notes: result.notes,
            metricCount: result.metrics?.length || 0,
          });
          return newMap;
        });

        // Refresh fleet and history
        this.loadDrones(false);
        this.loadHistory(drone.id);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const msg = err instanceof Error ? err.message : 'Lỗi không thể lưu biên bản kiểm định kỹ thuật.';
        this.errorMessage.set(msg);
      },
    });
  }

  protected getLatestInspection(droneId: string): DroneTechnicalInspectionSummaryDto | null {
    if (droneId === this.selectedDroneId() && this.historyItems().length > 0) {
      return this.historyItems()[0];
    }
    return (
      this.latestInspections().get(droneId) ??
      this.drones().find((d) => d.id === droneId)?.lastTechnicalInspection ??
      null
    );
  }

  protected isInspectionExpired(insp: DroneTechnicalInspectionSummaryDto | null | undefined): boolean {
    if (!insp?.validUntil) return true;
    return new Date(insp.validUntil).getTime() < Date.now();
  }

  protected inspectionStatusBadge(drone: UavRecord): { label: string; tone: string } {
    const insp = this.getLatestInspection(drone.id);
    if (!insp || !insp.completedAt) {
      return { label: 'Chưa kiểm định', tone: 'warning' };
    }
    if (insp.status === 'Failed' || insp.health === 'Critical' || drone.technicalHealth === 'Critical') {
      return { label: 'Không đạt (Critical)', tone: 'danger' };
    }
    if (this.isInspectionExpired(insp)) {
      return { label: 'Hết hạn', tone: 'danger' };
    }
    return { label: 'Đạt chuẩn', tone: 'success' };
  }

  protected inspectAllPendingDrones(): void {
    const pendingDrones = this.drones().filter((d) => {
      const badge = this.inspectionStatusBadge(d);
      return badge.tone !== 'success';
    });
    if (pendingDrones.length === 0 || this.bulkInspecting()) return;

    this.bulkInspecting.set(true);
    this.actionMessage.set('');
    this.errorMessage.set('');

    const checklist = buildInspectionChecklist({
      preset: 'healthy',
      batteryLevel: 95,
      gpsSatellites: 24,
      rfLinkQuality: 98,
      flightControllerConnected: false,
    });

    const calls = pendingDrones.map((d) =>
      this.preMissionApi
        .runTechnicalInspection(d.id, {
          notes: '[Định kỳ] Kiểm định kỹ thuật tự động đạt chuẩn phi đội',
          policyVersion: 'v2.0',
          metrics: checklist,
        })
        .pipe(
          map((res) => ({ success: true, drone: d, res })),
          catchError(() => of({ success: false, drone: d, res: null })),
        ),
    );

    forkJoin(calls)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          this.bulkInspecting.set(false);
          const succeeded = results.filter((r) => r.success).length;
          this.actionMessage.set(
            `Đã hoàn tất đo kiểm định kỳ đạt chuẩn cho ${succeeded}/${pendingDrones.length} phương tiện UAV! Tất cả đã đủ điều kiện bay.`,
          );
          this.loadDrones(false);
          if (this.selectedDroneId()) {
            this.loadHistory(this.selectedDroneId());
          }
        },
        error: () => {
          this.bulkInspecting.set(false);
          this.errorMessage.set('Không thể hoàn tất đo kiểm định kỳ hàng loạt.');
        },
      });
  }

  // Betaflight / MSP controls
  protected async connectWebSerial(): Promise<void> {
    this.pairingMessage.set('');
    try {
      await this.fcSerial.connectRealSerial();
      this.checkAndResolveConnectedFc();
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Không thể kết nối cổng COM');
    }
  }

  protected async connectSimulatedFc(): Promise<void> {
    this.pairingMessage.set('');
    try {
      await this.fcSerial.connectSimulated(this.selectedSimProfile());
      this.checkAndResolveConnectedFc();
    } catch (e: unknown) {
      this.errorMessage.set(e instanceof Error ? e.message : 'Lỗi kết nối mô phỏng FC');
    }
  }

  protected async disconnectFc(): Promise<void> {
    await this.fcSerial.disconnect();
    this.resolvedFcData.set(null);
  }

  private checkAndResolveConnectedFc(): void {
    const meta = this.fcMetadata();
    if (!meta || !meta.uid) return;
    this.resolvingFc.set(true);
    this.fcApi.resolveDrone(meta.uid).subscribe({
      next: (res: FlightControllerResolveResult) => {
        this.resolvingFc.set(false);
        this.resolvedFcData.set(res);
      },
      error: () => {
        this.resolvingFc.set(false);
        this.resolvedFcData.set(null);
      },
    });
  }

  protected pairFcWithCurrentDrone(): void {
    const drone = this.currentDrone();
    const meta = this.fcMetadata();
    if (!drone || !meta?.uid) return;

    this.pairingFc.set(true);
    this.fcApi.pairFlightController(drone.id, {
      flightControllerUid: meta.uid,
      boardIdentifier: meta.boardIdentifier || 'Betaflight',
      firmwareName: meta.firmwareName || 'Betaflight',
      firmwareVersion: meta.firmwareVersion || 'v4.5',
    }).subscribe({
      next: () => {
        this.pairingFc.set(false);
        this.pairingMessage.set(`Đã ghép nối Flight Controller ${meta.uid.slice(0, 8)}... với UAV ${drone.code} thành công!`);
        this.checkAndResolveConnectedFc();
      },
      error: () => {
        this.pairingFc.set(false);
        this.errorMessage.set('Không thể ghép nối Flight Controller với UAV này.');
      },
    });
  }
}

