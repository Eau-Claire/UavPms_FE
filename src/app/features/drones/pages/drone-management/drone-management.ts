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
import { finalize } from 'rxjs';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { DroneManagementApi } from '../../data-access/drone-management-api';
import {
  BasicTechnicalCheckRequest,
  CreateUavRequest,
  GisDroneCapabilityItemDto,
  GisDroneEstimationResult,
  UavOperationalStatus,
  UavRecord,
  UavTechnicalHealth,
  UpdateUavRequest,
} from '../../../../models/drone-management.models';
import { BetaflightSerialService } from '../../../../core/services/betaflight-serial.service';

@Component({
  selector: 'app-drone-management',
  imports: [ReactiveFormsModule, NzIconModule, DatePipe, DecimalPipe],
  templateUrl: './drone-management.html',
  styleUrl: './drone-management.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DroneManagement {
  private readonly api = inject(DroneManagementApi);
  private readonly fcSerial = inject(BetaflightSerialService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly drones = signal<readonly UavRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly successMessage = signal('');

  // Filters
  protected readonly search = signal('');
  protected readonly statusFilter = signal<UavOperationalStatus | ''>('');
  protected readonly healthFilter = signal<UavTechnicalHealth | ''>('');

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
      available: list.filter((d) => (d.operationalStatus || '').toUpperCase() === 'AVAILABLE').length,
      inUse: list.filter((d) => ['IN_USE', 'RESERVED'].includes((d.operationalStatus || '').toUpperCase())).length,
      maintenance: list.filter((d) => ['MAINTENANCE', 'UNAVAILABLE', 'LOST'].includes((d.operationalStatus || '').toUpperCase())).length,
      healthy: list.filter((d) => (d.technicalHealth || '').toUpperCase() === 'HEALTHY').length,
      warning: list.filter((d) => (d.technicalHealth || '').toUpperCase() === 'WARNING').length,
      critical: list.filter((d) => (d.technicalHealth || '').toUpperCase() === 'CRITICAL').length,
    };
  });

  // Filtered List
  protected readonly filteredDrones = computed(() => {
    const term = this.search().trim().toLowerCase();
    const st = this.statusFilter();
    const hl = this.healthFilter();

    return this.drones().filter((drone) => {
      const matchTerm =
        !term ||
        `${drone.uavCode} ${drone.name} ${drone.model} ${drone.serialNumber || ''} ${drone.activeFlightController?.flightControllerUid || ''}`
          .toLowerCase()
          .includes(term);
      const matchStatus = !st || drone.operationalStatus === st;
      const matchHealth = !hl || drone.technicalHealth === hl;
      return matchTerm && matchStatus && matchHealth;
    });
  });

  // Drone Create / Edit Form
  protected readonly droneForm = this.fb.nonNullable.group({
    uavCode: ['', Validators.required],
    name: ['', Validators.required],
    model: ['', Validators.required],
    category: ['Hexacopter'],
    serialNumber: [''],
    assignedRegionId: [''],
    flightEnduranceMinutes: [35.0, [Validators.required, Validators.min(5)]],
    operationalRangeKm: [15.0, [Validators.required, Validators.min(1)]],
    cameraPayloadInfo: ['Zenmuse H20T Thermal & Optical 4K'],
    batteryLevel: [100.0, [Validators.min(0), Validators.max(100)]],
    operationalStatus: ['AVAILABLE' as UavOperationalStatus],
    technicalHealth: ['HEALTHY' as UavTechnicalHealth],
  });

  // Basic Technical Check Form (8 Items)
  protected readonly checkForm = this.fb.nonNullable.group({
    frameBodyPassed: [true],
    frameBodyNote: [''],
    propellersPassed: [true],
    propellersNote: [''],
    motorsPassed: [true],
    motorsNote: [''],
    cameraPayloadPassed: [true],
    cameraPayloadNote: [''],
    batteryPassed: [true],
    batteryVoltage: [24.8],
    batteryPercent: [95],
    batteryCellCount: [6],
    batteryNote: ['Pin dung lượng chuẩn, trở kháng cell đều'],
    gpsPassed: [true],
    gpsFixStatus: ['3D_FIX_RTK'],
    gpsSatelliteCount: [22],
    gpsNote: ['Đã khóa 22 vệ tinh GNSS'],
    communicationPassed: [true],
    communicationSignal: ['100% (-58 dBm)'],
    communicationNote: ['Kênh vô tuyến kép 2.4/5.8GHz ổn định'],
    flightControllerPassed: [true],
    flightControllerUid: [''],
    flightControllerBoard: ['MATEKF722'],
    flightControllerFirmware: ['Betaflight 4.5.1'],
    flightControllerNote: ['Bo mạch phản hồi MSP_UID chuẩn xác'],
    notes: ['Kiểm định tiền bay đạt điều kiện khai thác an toàn.'],
  });

  // GIS Drone Scope Estimation Form (Issue Note #152)
  protected readonly gisForm = this.fb.nonNullable.group({
    corridorLengthKm: [5.0, [Validators.required, Validators.min(0.1)]],
    assetCount: [12, [Validators.required, Validators.min(1)]],
    averageSpeedKmH: [36.0, [Validators.required, Validators.min(10)]],
    batteryReservePercent: [20.0, [Validators.required, Validators.min(5), Validators.max(50)]],
    inspectionTimePerAssetMinutes: [2.0, [Validators.required, Validators.min(0.5)]],
  });

  constructor() {
    this.loadDrones();
  }

  protected loadDrones(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .getDrones()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (items) => this.drones.set(items),
        error: () => this.error.set('Không thể tải danh sách phương tiện UAV.'),
      });
  }

  // --- CRUD Actions ---
  protected openCreate(): void {
    this.editingDrone.set(null);
    this.droneForm.reset({
      uavCode: `UAV-${String(this.drones().length + 1).padStart(3, '0')}`,
      name: 'UAV Khảo sát đường dây',
      model: 'Matrice 350 RTK',
      category: 'Hexacopter',
      serialNumber: `SN-EVN-${Date.now().toString().slice(-6)}`,
      assignedRegionId: '',
      flightEnduranceMinutes: 40.0,
      operationalRangeKm: 20.0,
      cameraPayloadInfo: 'Zenmuse H20T Zoom 23x & Thermal Sensor',
      batteryLevel: 100.0,
      operationalStatus: 'AVAILABLE',
      technicalHealth: 'HEALTHY',
    });
    this.modalOpen.set(true);
  }

  protected openEdit(drone: UavRecord): void {
    this.editingDrone.set(drone);
    this.droneForm.patchValue({
      uavCode: drone.uavCode,
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
            this.showNotification(`Đã cập nhật phương tiện ${updated.uavCode}`);
          },
          error: (err) => {
            this.error.set(err?.error?.message || 'Không thể cập nhật UAV.');
          },
        });
    } else {
      const createPayload: CreateUavRequest = {
        uavCode: val.uavCode,
        name: val.name,
        model: val.model,
        category: val.category,
        serialNumber: val.serialNumber,
        assignedRegionId: val.assignedRegionId || null,
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
            this.showNotification(`Đã tạo mới phương tiện ${created.uavCode}`);
          },
          error: (err) => {
            this.error.set(err?.error?.message || 'Không thể tạo mới UAV.');
          },
        });
    }
  }

  protected deleteDrone(drone: UavRecord): void {
    if (drone.operationalStatus === 'IN_USE') {
      alert(`Không thể xóa UAV ${drone.uavCode} đang làm nhiệm vụ bay.`);
      return;
    }
    if (!confirm(`Bạn có chắc muốn xóa phương tiện ${drone.uavCode} (${drone.name})?`)) {
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
          this.showNotification(`Đã xóa phương tiện ${drone.uavCode}`);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Không thể xóa UAV.');
        },
      });
  }

  // --- Basic Technical Check Modal ---
  protected openTechCheck(drone: UavRecord): void {
    this.targetDroneForCheck.set(drone);
    const fc = drone.activeFlightController;

    this.checkForm.reset({
      frameBodyPassed: true,
      frameBodyNote: 'Khung vỏ sợi cacbon nguyên vẹn, không nứt gãy',
      propellersPassed: true,
      propellersNote: 'Cánh quạt cân bằng động tốt, không mẻ nứt',
      motorsPassed: true,
      motorsNote: '4/6 động cơ không chổi than quay êm, nhiệt độ chuẩn',
      cameraPayloadPassed: true,
      cameraPayloadNote: 'Gimbal chống rung 3 trục ổn định, cảm biến nét',
      batteryPassed: (drone.batteryLevel ?? 100) >= 30,
      batteryVoltage: 24.8,
      batteryPercent: Math.round(drone.batteryLevel ?? 95),
      batteryCellCount: 6,
      batteryNote: 'Pin dung lượng đạt chuẩn kiểm định an toàn',
      gpsPassed: true,
      gpsFixStatus: '3D_FIX_RTK',
      gpsSatelliteCount: 22,
      gpsNote: 'Đã khóa định vị RTK chính xác cao',
      communicationPassed: drone.isOnline !== false,
      communicationSignal: '100% (-55 dBm)',
      communicationNote: 'Kênh truyền tín hiệu điều khiển và telemetry tốt',
      flightControllerPassed: true,
      flightControllerUid: fc?.flightControllerUid || 'BF-F405-A1B2C3D4',
      flightControllerBoard: fc?.boardIdentifier || 'STM32F405',
      flightControllerFirmware: `${fc?.firmwareName || 'Betaflight'} ${fc?.firmwareVersion || '4.5.1'}`.trim(),
      flightControllerNote: 'FC phản hồi giao thức MSP chuẩn xác',
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
        flightControllerNote: `Đọc trực tiếp qua Web Serial MSP (UID: ${meta.uid})`,
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
      frameBodyNote: val.frameBodyNote || undefined,
      propellersPassed: val.propellersPassed,
      propellersNote: val.propellersNote || undefined,
      motorsPassed: val.motorsPassed,
      motorsNote: val.motorsNote || undefined,
      cameraPayloadPassed: val.cameraPayloadNote ? val.cameraPayloadPassed : val.cameraPayloadPassed,
      cameraPayloadNote: val.cameraPayloadNote || undefined,
      batteryPassed: val.batteryPassed,
      batteryVoltage: Number(val.batteryVoltage) || undefined,
      batteryPercent: Number(val.batteryPercent) || undefined,
      batteryCellCount: Number(val.batteryCellCount) || undefined,
      batteryNote: val.batteryNote || undefined,
      gpsPassed: val.gpsPassed,
      gpsFixStatus: val.gpsFixStatus || undefined,
      gpsSatelliteCount: Number(val.gpsSatelliteCount) || undefined,
      gpsNote: val.gpsNote || undefined,
      communicationPassed: val.communicationPassed,
      communicationSignal: val.communicationSignal || undefined,
      communicationNote: val.communicationNote || undefined,
      flightControllerPassed: val.flightControllerPassed,
      flightControllerUid: val.flightControllerUid || undefined,
      flightControllerBoard: val.flightControllerBoard || undefined,
      flightControllerFirmware: val.flightControllerFirmware || undefined,
      flightControllerNote: val.flightControllerNote || undefined,
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
            `Đã lưu kiểm định cho ${drone.uavCode}: Kết quả ${res?.status || 'Hoàn tất'} - Sức khỏe kỹ thuật: ${res?.health || 'Cập nhật'}.`,
          );
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Không thể lưu biên bản kiểm định kỹ thuật.');
        },
      });
  }

  // --- GIS Scope & Drone Estimation (Note #152) ---
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
        averageSpeedKmH: Number(val.averageSpeedKmH),
        batteryReservePercent: Number(val.batteryReservePercent),
        inspectionTimePerAssetMinutes: Number(val.inspectionTimePerAssetMinutes),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.gisBusy.set(false)),
      )
      .subscribe({
        next: (result) => this.gisResult.set(result),
        error: () => this.error.set('Không thể tính toán ước tính tải GIS.'),
      });
  }

  // --- Helpers ---
  protected statusBadgeClass(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'AVAILABLE') return 'badge-available';
    if (s === 'IN_USE') return 'badge-inuse';
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

  protected suitabilityBadgeClass(suitability: string): string {
    const s = (suitability || '').toUpperCase();
    if (s === 'SUITABLE') return 'badge-suitable';
    if (s === 'SUITABLE_WITH_SPLIT') return 'badge-split';
    return 'badge-unsuitable';
  }

  private showNotification(msg: string): void {
    this.successMessage.set(msg);
    setTimeout(() => {
      this.successMessage.set('');
    }, 4500);
  }
}
