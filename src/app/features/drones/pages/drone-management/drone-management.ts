import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ToastService } from '../../../../core/toast/toast.service';
import { Pagination } from '../../../../shared/components/pagination/pagination';
import { DroneManagementApi } from '../../data-access/drone-management-api';
import {
  BasicTechnicalCheckRequest,
  CreateUavRequest,
  DroneTechnicalInspectionSummaryDto,
  GisDroneCapabilityItemDto,
  GisDroneEstimationResult,
  UAV_OPERATIONAL_STATUSES,
  UAV_TECHNICAL_HEALTHS,
  UavOperationalStatus,
  UavRecord,
  UavTechnicalHealth,
  UpdateUavRequest,
} from '../../../../models/drone-management.models';
import { BetaflightSerialService } from '../../../../core/services/betaflight-serial.service';
import { FlightControllerApi } from '../../../pre-mission/data-access/flight-controller-api';
import { Auth } from '../../../../core/auth/auth';
import { isManagerRole, isTechnicianRole } from '../../../../core/auth/roles';
import { statusLabel as sharedStatusLabel } from '../../../../shared/status/status';
import { describeHttpError } from '../../../../shared/errors/business-error-messages';
import { statusColorClass, statusLabel as globalStatusLabel } from '../../../../shared/status/status';

@Component({
  selector: 'app-drone-management',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, Pagination],
  templateUrl: './drone-management.html',
  styleUrl: './drone-management.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DroneManagement {
  private readonly api = inject(DroneManagementApi);
  private readonly fcSerial = inject(BetaflightSerialService);
  private readonly fcApi = inject(FlightControllerApi);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);
  private readonly toast = inject(ToastService);

  /** `DELETE /drones/{id}` and the GIS load estimate (fleet planning) are for SystemAdmin/Manager. */
  protected readonly canManageFleet = computed(() => isManagerRole(this.auth.user()?.role));
  /** `POST/PUT /drones` and `POST /drones/{id}/basic-technical-check`: managers and technicians. Others read only. */
  protected readonly canEditDrone = computed(() => this.canManageFleet() || isTechnicianRole(this.auth.user()?.role));

  // Technical-inspection history (`GET /drones/{id}/technical-inspections`, every role)
  protected readonly historyDrone = signal<UavRecord | null>(null);
  protected readonly historyItems = signal<readonly DroneTechnicalInspectionSummaryDto[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal('');

  protected readonly operationalStatuses = UAV_OPERATIONAL_STATUSES;
  protected readonly technicalHealths = UAV_TECHNICAL_HEALTHS;
  protected readonly drones = signal<readonly UavRecord[]>([]);
  protected readonly initialLoading = signal(true);
  protected readonly fetching = signal(false);
  protected readonly loading = computed(() => this.initialLoading() || this.fetching());
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, i) => i + 1);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly successMessage = signal('');

  // Filters
  protected readonly search = signal('');
  protected readonly statusFilter = signal<UavOperationalStatus | ''>('');
  protected readonly healthFilter = signal<UavTechnicalHealth | ''>('');
  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.search().trim() || this.statusFilter() || this.healthFilter()),
  );

  // Pagination
  protected readonly page = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredDrones().length / this.pageSize())),
  );
  protected readonly paginatedDrones = computed(() => {
    const p = this.page();
    const s = this.pageSize();
    return this.filteredDrones().slice((p - 1) * s, p * s);
  });

  // Modals state
  protected readonly modalOpen = signal(false);
  protected readonly editingDrone = signal<UavRecord | null>(null);

  protected readonly techCheckModalOpen = signal(false);
  protected readonly targetDroneForCheck = signal<UavRecord | null>(null);

  protected readonly gisModalOpen = signal(false);
  protected readonly gisBusy = signal(false);
  protected readonly gisResult = signal<GisDroneEstimationResult | null>(null);

  // Statistics
  protected readonly stats = computed(() => {
    const list = this.drones();
    return {
      total: list.length,
      available: list.filter((d) => d.operationalStatus === 'Available').length,
      inUse: list.filter((d) => d.operationalStatus === 'InUse' || d.operationalStatus === 'Reserved').length,
      maintenance: list.filter((d) => ['Maintenance', 'Unavailable', 'Lost'].includes(d.operationalStatus)).length,
      healthy: list.filter((d) => d.technicalHealth === 'Healthy').length,
      warning: list.filter((d) => d.technicalHealth === 'Warning').length,
      critical: list.filter((d) => d.technicalHealth === 'Critical').length,
    };
  });

  // Filtered List (case/separator insensitive so backend casing like HEALTHY / IN_USE always matches)
  protected readonly filteredDrones = computed(() => {
    const term = this.search().trim().toLowerCase();
    const norm = (val?: string | null) => (val || '').trim().toUpperCase().replace(/[\s_-]/g, '');
    const st = norm(this.statusFilter());
    const hl = norm(this.healthFilter());

    return this.drones().filter((drone) => {
      const matchTerm =
        !term ||
        `${drone.code} ${drone.name} ${drone.model} ${drone.serialNumber || ''} ${drone.activeFlightController?.flightControllerUid || ''}`
          .toLowerCase()
          .includes(term);
      const matchStatus = !st || norm(drone.operationalStatus) === st;
      const matchHealth = !hl || norm(drone.technicalHealth) === hl;
      return matchTerm && matchStatus && matchHealth;
    });
  });

  // Drone Create / Edit Form
  protected readonly droneForm = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    model: ['', Validators.required],
    category: ['Hexacopter'],
    serialNumber: [''],
    assignedRegionId: [''],
    flightEnduranceMinutes: [35.0, [Validators.required, Validators.min(5)]],
    operationalRangeKm: [15.0, [Validators.required, Validators.min(1)]],
    cameraPayloadInfo: ['Zenmuse H20T Thermal & Optical 4K'],
    batteryLevel: [100.0, [Validators.min(0), Validators.max(100)]],
    operationalStatus: ['Available' as UavOperationalStatus],
    technicalHealth: ['Unknown' as UavTechnicalHealth],
  });

  // Basic Technical Check Form (8 Items)
  protected readonly checkForm = this.fb.nonNullable.group({
    frameBodyPassed: [true],
    frameBodyNotes: [''],
    propellersPassed: [true],
    propellersNotes: [''],
    motorsPassed: [true],
    motorsNotes: [''],
    cameraPayloadPassed: [true],
    cameraPayloadNotes: [''],
    batteryPassed: [true],
    batteryVoltage: [24.8],
    batteryPercent: [95],
    batteryCellCount: [6],
    batteryNotes: ['Pin dung lượng chuẩn, trở kháng cell đều'],
    gpsPassed: [true],
    gpsFixStatus: ['3D_FIX_RTK'],
    gpsSatelliteCount: [22],
    gpsNotes: ['Đã khóa 22 vệ tinh GNSS'],
    communicationPassed: [true],
    communicationSignalInfo: ['100% (-58 dBm)'],
    communicationNotes: ['Kênh vô tuyến kép 2.4/5.8GHz ổn định'],
    flightControllerPassed: [true],
    flightControllerUid: [''],
    flightControllerBoard: ['MATEKF722'],
    flightControllerFirmware: ['Betaflight 4.5.1'],
    flightControllerNotes: ['Bo mạch phản hồi MSP_UID chuẩn xác'],
    notes: ['Kiểm định tiền bay đạt điều kiện khai thác an toàn.'],
  });

  // GIS Drone Scope Estimation Form
  protected readonly gisForm = this.fb.nonNullable.group({
    corridorLengthKm: [5.0, [Validators.required, Validators.min(0.1)]],
    assetCount: [12, [Validators.required, Validators.min(1)]],
  });

  // Flight Controller (FC) Update & Pairing Modal State
  protected readonly fcModalOpen = signal(false);
  protected readonly targetDroneForFc = signal<UavRecord | null>(null);
  protected readonly fcBusy = signal(false);
  protected readonly fcError = signal('');
  protected readonly fcForm = this.fb.nonNullable.group({
    flightControllerUid: ['', [Validators.required]],
    boardIdentifier: ['Betaflight STM32F405'],
    firmwareName: ['Betaflight'],
    firmwareVersion: ['4.5.1'],
  });

  protected openFcModal(drone: UavRecord): void {
    this.targetDroneForFc.set(drone);
    this.fcError.set('');
    const currentFc = drone.activeFlightController;
    this.fcForm.reset({
      flightControllerUid: currentFc?.flightControllerUid || '',
      boardIdentifier: currentFc?.boardIdentifier || 'Betaflight STM32F405',
      firmwareName: currentFc?.firmwareName || 'Betaflight',
      firmwareVersion: currentFc?.firmwareVersion || '4.5.1',
    });
    this.fcModalOpen.set(true);
  }

  protected closeFcModal(): void {
    this.fcModalOpen.set(false);
    this.targetDroneForFc.set(null);
  }

  protected async scanFcFromUsb(): Promise<void> {
    try {
      this.fcBusy.set(true);
      this.fcError.set('');
      const meta = await this.fcSerial.connectRealSerial();
      this.fcForm.patchValue({
        flightControllerUid: meta.uid,
        boardIdentifier: meta.boardIdentifier || 'Betaflight Board',
        firmwareName: meta.firmwareName || 'Betaflight',
        firmwareVersion: meta.firmwareVersion || '4.5.1',
      });
      this.showNotification(`Đã nhận diện FC UID: ${meta.uid}`);
    } catch (err: unknown) {
      this.fcError.set(describeHttpError(err, 'Không thể kết nối Flight Controller qua cổng USB.'));
    } finally {
      this.fcBusy.set(false);
    }
  }

  protected saveFcBinding(): void {
    const drone = this.targetDroneForFc();
    if (!drone) return;
    if (this.fcForm.invalid) {
      this.fcError.set('Vui lòng nhập UID phần cứng FC hợp lệ.');
      return;
    }
    const val = this.fcForm.getRawValue();
    this.fcBusy.set(true);
    this.fcError.set('');

    this.fcApi
      .pairFlightController(drone.id, {
        flightControllerUid: val.flightControllerUid.trim(),
        boardIdentifier: val.boardIdentifier.trim() || undefined,
        firmwareName: val.firmwareName.trim() || undefined,
        firmwareVersion: val.firmwareVersion.trim() || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.fcBusy.set(false)),
      )
      .subscribe({
        next: (binding) => {
          this.showNotification(`Đã cập nhật Flight Controller UID ${binding.flightControllerUid} cho UAV ${drone.code}.`);
          this.closeFcModal();
          this.loadDrones();
        },
        error: (err: unknown) => {
          this.fcError.set(describeHttpError(err, 'Không thể ghép nối Flight Controller.'));
        },
      });
  }

  protected unpairFc(): void {
    const drone = this.targetDroneForFc();
    if (!drone) return;
    if (!confirm(`Bạn có chắc chắn muốn hủy ghép nối Flight Controller khỏi UAV ${drone.code}?`)) return;

    this.fcBusy.set(true);
    this.fcError.set('');

    this.fcApi
      .unpairFlightController(drone.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.fcBusy.set(false)),
      )
      .subscribe({
        next: () => {
          this.showNotification(`Đã hủy ghép nối Flight Controller khỏi UAV ${drone.code}.`);
          this.closeFcModal();
          this.loadDrones();
        },
        error: (err: unknown) => {
          this.fcError.set(describeHttpError(err, 'Không thể hủy ghép nối Flight Controller.'));
        },
      });
  }

  constructor() {
    this.loadDrones();
  }

  protected loadDrones(): void {
    this.fetching.set(true);
    this.error.set('');
    this.api
      .getDrones()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.initialLoading.set(false);
          this.fetching.set(false);
        }),
      )
      .subscribe({
        next: (items) => this.drones.set(items),
        error: (err: unknown) => this.error.set(describeHttpError(err, 'Không thể tải danh sách phương tiện UAV.')),
      });
  }

  protected onSearchEvent(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.search.set(target?.value ?? '');
    this.page.set(1);
  }

  protected onStatusEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.statusFilter.set((target?.value ?? '') as UavOperationalStatus | '');
    this.page.set(1);
  }

  protected onHealthEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.healthFilter.set((target?.value ?? '') as UavTechnicalHealth | '');
    this.page.set(1);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.statusFilter.set('');
    this.healthFilter.set('');
    this.page.set(1);
  }

  protected readonly statusColorClass = statusColorClass;
  protected readonly globalStatusLabel = globalStatusLabel;

  // --- CRUD Actions ---
  protected openCreate(): void {
    this.editingDrone.set(null);
    this.droneForm.reset({
      code: `UAV-${String(this.drones().length + 1).padStart(3, '0')}`,
      name: 'UAV Khảo sát đường dây',
      model: 'Matrice 350 RTK',
      category: 'Hexacopter',
      serialNumber: `SN-EVN-${Date.now().toString().slice(-6)}`,
      assignedRegionId: '',
      flightEnduranceMinutes: 40.0,
      operationalRangeKm: 20.0,
      cameraPayloadInfo: 'Zenmuse H20T Zoom 23x & Thermal Sensor',
      batteryLevel: 100.0,
      operationalStatus: 'Available',
      technicalHealth: 'Unknown',
    });
    this.modalOpen.set(true);
  }

  protected openEdit(drone: UavRecord): void {
    this.editingDrone.set(drone);
    this.droneForm.patchValue({
      code: drone.code,
      name: drone.name,
      model: drone.model,
      category: drone.category || 'Quadcopter',
      serialNumber: drone.serialNumber || '',
      assignedRegionId: drone.assignedRegionId || '',
      flightEnduranceMinutes: drone.flightEnduranceMinutes || 35.0,
      operationalRangeKm: drone.operationalRangeKm || 15.0,
      cameraPayloadInfo: drone.cameraPayloadInfo || '',
      batteryLevel: drone.batteryLevel ?? 100,
      operationalStatus: drone.operationalStatus,
      technicalHealth: drone.technicalHealth,
    });
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.editingDrone.set(null);
  }

  protected saveDrone(): void {
    if (this.droneForm.invalid) {
      this.droneForm.markAllAsTouched();
      return;
    }

    const val = this.droneForm.getRawValue();
    this.busy.set(true);
    this.error.set('');

    const current = this.editingDrone();
    if (current) {
      const updatePayload: UpdateUavRequest = {
        name: val.name,
        model: val.model,
        category: val.category,
        serialNumber: val.serialNumber,
        assignedRegionId: val.assignedRegionId || null,
        operationalStatus: val.operationalStatus,
        technicalHealth: val.technicalHealth,
        flightEnduranceMinutes: Number(val.flightEnduranceMinutes),
        operationalRangeKm: Number(val.operationalRangeKm),
        cameraPayloadInfo: val.cameraPayloadInfo,
        batteryLevel: Number(val.batteryLevel),
      };

      this.api
        .updateDrone(current.id, updatePayload)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.busy.set(false)),
        )
        .subscribe({
          next: (updated) => {
            this.drones.update((list) =>
              list.map((d) => (d.id === updated.id ? updated : d)),
            );
            this.closeModal();
            this.showNotification(`Đã cập nhật phương tiện ${updated.code}`);
          },
          error: (err: unknown) => {
            this.error.set(describeHttpError(err, 'Không thể cập nhật UAV.'));
          },
        });
    } else {
      const createPayload: CreateUavRequest = {
        code: val.code,
        name: val.name,
        model: val.model,
        category: val.category,
        serialNumber: val.serialNumber,
        assignedRegionId: val.assignedRegionId || null,
        operationalStatus: val.operationalStatus,
        technicalHealth: val.technicalHealth,
        flightEnduranceMinutes: Number(val.flightEnduranceMinutes),
        operationalRangeKm: Number(val.operationalRangeKm),
        cameraPayloadInfo: val.cameraPayloadInfo,
        batteryLevel: Number(val.batteryLevel),
      };

      this.api
        .createDrone(createPayload)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.busy.set(false)),
        )
        .subscribe({
          next: (created) => {
            this.drones.update((list) => [created, ...list]);
            this.closeModal();
            this.showNotification(`Đã tạo mới phương tiện ${created.code}`);
          },
          error: (err: unknown) => {
            this.error.set(describeHttpError(err, 'Không thể tạo mới UAV.'));
          },
        });
    }
  }

  protected deleteDrone(drone: UavRecord): void {
    if (drone.operationalStatus === 'InUse') {
      alert(`Không thể xóa UAV ${drone.code} đang làm nhiệm vụ bay.`);
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa phương tiện ${drone.code} (${drone.name})?`)) {
      return;
    }

    this.busy.set(true);
    this.api
      .deleteDrone(drone.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.drones.update((list) => list.filter((d) => d.id !== drone.id));
          this.showNotification(`Đã xóa phương tiện ${drone.code}`);
        },
        error: (err: unknown) => {
          this.error.set(describeHttpError(err, 'Không thể xóa UAV.'));
        },
      });
  }

  // --- Technical inspection history ---
  protected openHistory(drone: UavRecord): void {
    this.historyDrone.set(drone);
    this.historyItems.set([]);
    this.historyError.set('');
    this.historyLoading.set(true);
    this.api
      .getTechnicalInspections(drone.id, 1, 20)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.historyLoading.set(false)),
      )
      .subscribe({
        next: (items) => this.historyItems.set(items),
        error: () => this.historyError.set('Không thể tải lịch sử kiểm định của UAV này.'),
      });
  }

  protected closeHistory(): void {
    this.historyDrone.set(null);
  }

  // --- Basic Technical Check Modal ---
  protected openTechCheck(drone: UavRecord): void {
    this.targetDroneForCheck.set(drone);
    const fc = drone.activeFlightController;

    this.checkForm.reset({
      frameBodyPassed: true,
      frameBodyNotes: 'Khung vỏ sợi cacbon nguyên vẹn, không nứt gãy',
      propellersPassed: true,
      propellersNotes: 'Cánh quạt cân bằng động tốt, không mẻ nứt',
      motorsPassed: true,
      motorsNotes: '4/6 động cơ không chổi than quay êm, nhiệt độ chuẩn',
      cameraPayloadPassed: true,
      cameraPayloadNotes: 'Gimbal chống rung 3 trục ổn định, cảm biến nét',
      batteryPassed: (drone.batteryLevel ?? 100) >= 30,
      batteryVoltage: 24.8,
      batteryPercent: Math.round(drone.batteryLevel ?? 95),
      batteryCellCount: 6,
      batteryNotes: 'Pin dung lượng đạt chuẩn kiểm định an toàn',
      gpsPassed: true,
      gpsFixStatus: '3D_FIX_RTK',
      gpsSatelliteCount: 22,
      gpsNotes: 'Đã khóa định vị RTK chính xác cao',
      communicationPassed: true,
      communicationSignalInfo: '100% (-55 dBm)',
      communicationNotes: 'Kênh truyền tín hiệu điều khiển và telemetry tốt',
      flightControllerPassed: true,
      flightControllerUid: fc?.flightControllerUid || 'BF-F405-A1B2C3D4',
      flightControllerBoard: fc?.boardIdentifier || 'STM32F405',
      flightControllerFirmware: `${fc?.firmwareName || 'Betaflight'} ${fc?.firmwareVersion || '4.5.1'}`.trim(),
      flightControllerNotes: 'FC phản hồi giao thức MSP chuẩn xác',
      notes: 'Biên bản kiểm tra kỹ thuật định kỳ đầy đủ 8 hạng mục an toàn.',
    });

    this.techCheckModalOpen.set(true);
  }

  protected closeTechCheck(): void {
    this.techCheckModalOpen.set(false);
    this.targetDroneForCheck.set(null);
  }

  protected populateFcFromConnectedSerial(): void {
    const meta = this.fcSerial.activeMetadata();
    if (meta?.uid) {
      this.checkForm.patchValue({
        flightControllerUid: meta.uid,
        flightControllerBoard: meta.boardIdentifier || 'Betaflight Board',
        flightControllerFirmware: `${meta.firmwareName || 'Betaflight'} ${meta.firmwareVersion || ''}`.trim(),
        flightControllerNotes: `Đọc trực tiếp qua Web Serial MSP (UID: ${meta.uid})`,
      });
      this.showNotification(`Đã nạp UID phần cứng ${meta.uid} từ Flight Controller đang kết nối.`);
    } else {
      alert('Chưa phát hiện Flight Controller kết nối qua cổng USB/Serial.');
    }
  }

  protected submitTechnicalCheck(): void {
    const drone = this.targetDroneForCheck();
    if (!drone) return;

    const val = this.checkForm.getRawValue();
    this.busy.set(true);
    this.error.set('');

    const payload: BasicTechnicalCheckRequest = {
      frameBodyPassed: val.frameBodyPassed,
      frameBodyNotes: val.frameBodyNotes || undefined,
      propellersPassed: val.propellersPassed,
      propellersNotes: val.propellersNotes || undefined,
      motorsPassed: val.motorsPassed,
      motorsNotes: val.motorsNotes || undefined,
      cameraPayloadPassed: val.cameraPayloadPassed,
      cameraPayloadNotes: val.cameraPayloadNotes || undefined,
      batteryPassed: val.batteryPassed,
      batteryVoltage: Number(val.batteryVoltage) || undefined,
      batteryPercent: Number(val.batteryPercent) || undefined,
      batteryCellCount: Number(val.batteryCellCount) || undefined,
      batteryNotes: val.batteryNotes || undefined,
      gpsPassed: val.gpsPassed,
      gpsFixStatus: val.gpsFixStatus || undefined,
      gpsSatelliteCount: Number(val.gpsSatelliteCount) || undefined,
      gpsNotes: val.gpsNotes || undefined,
      communicationPassed: val.communicationPassed,
      communicationSignalInfo: val.communicationSignalInfo || undefined,
      communicationNotes: val.communicationNotes || undefined,
      flightControllerPassed: val.flightControllerPassed,
      flightControllerUid: val.flightControllerUid || undefined,
      flightControllerBoard: val.flightControllerBoard || undefined,
      flightControllerFirmware: val.flightControllerFirmware || undefined,
      flightControllerNotes: val.flightControllerNotes || undefined,
      notes: val.notes || undefined,
    };

    this.api
      .submitBasicTechnicalCheck(drone.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (res) => {
          this.closeTechCheck();
          this.loadDrones(); // refresh to get updated technical health and inspection summary
          this.showNotification(
            `Đã lưu kiểm định cho ${drone.code}: Kết quả ${res?.status || 'Hoàn tất'} - Sức khỏe kỹ thuật: ${res?.health || 'Cập nhật'}.`,
          );
        },
        error: (err: unknown) => {
          this.error.set(describeHttpError(err, 'Không thể lưu biên bản kiểm định kỹ thuật.'));
        },
      });
  }

  // --- GIS Scope & Drone Estimation ---
  protected openGisModal(): void {
    this.gisModalOpen.set(true);
    this.runGisEstimation();
  }

  protected closeGisModal(): void {
    this.gisModalOpen.set(false);
  }

  protected runGisEstimation(): void {
    if (this.gisForm.invalid) return;

    const val = this.gisForm.getRawValue();
    this.gisBusy.set(true);

    this.api
      .estimateGisScope({
        corridorLengthKm: Number(val.corridorLengthKm),
        assetCount: Number(val.assetCount),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.gisBusy.set(false)),
      )
      .subscribe({
        next: (result) => this.gisResult.set(result),
        error: (err: unknown) => this.error.set(describeHttpError(err, 'Không thể tính toán ước tính tải GIS.')),
      });
  }

  // --- Helpers ---
  protected statusLabel(status: string): string {
    return status ? sharedStatusLabel(status) : 'Chưa rõ';
  }

  protected healthLabel(health: string): string {
    return health ? sharedStatusLabel(health) : 'Chưa kiểm định';
  }

  protected statusBadgeClass(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'AVAILABLE') return 'badge-available';
    if (s === 'INUSE') return 'badge-inuse';
    if (s === 'RESERVED') return 'badge-reserved';
    if (s === 'MAINTENANCE') return 'badge-maintenance';
    if (s === 'UNAVAILABLE' || s === 'LOST') return 'badge-critical';
    return 'badge-unknown';
  }

  protected healthBadgeClass(health: string): string {
    const h = (health || '').toUpperCase();
    if (h === 'HEALTHY') return 'badge-healthy';
    if (h === 'WARNING') return 'badge-warning';
    if (h === 'CRITICAL') return 'badge-critical';
    return 'badge-unknown';
  }

  protected operationalStatusTone(status: string): string {
    switch ((status || '').toUpperCase()) {
      case 'AVAILABLE':
        return 'success';
      case 'INUSE':
        return 'info';
      case 'RESERVED':
      case 'MAINTENANCE':
        return 'warning';
      case 'UNAVAILABLE':
      case 'LOST':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  protected technicalHealthTone(health: string): string {
    switch ((health || '').toUpperCase()) {
      case 'HEALTHY':
        return 'success';
      case 'WARNING':
        return 'warning';
      case 'CRITICAL':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  protected suitabilityBadgeClass(suitability: string): string {
    const s = (suitability || '').toUpperCase();
    if (s === 'SUITABLE') return 'badge-suitable';
    if (s === 'SUITABLE_WITH_SPLIT') return 'badge-split';
    return 'badge-unsuitable';
  }

  private showNotification(msg: string): void {
    this.toast.success(msg);
  }
}
