import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { AppstoreOutline, ArrowLeftOutline, AuditOutline } from '@ant-design/icons-angular/icons';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { TowerHistory } from '../../../../models/assets.models';
import { TowersApi } from '../../data-access/towers-api';
import { TowerDetail } from './tower-detail';

const history = (anomalyPage = 1, maintenancePage = 1): TowerHistory => ({
  tower: { id: 't1', regionId: 'r1', regionName: 'Hải Phòng', towerCode: 'T-01', latitude: 20.8, longitude: 106.6 },
  anomalies: [{ id: 'a1', mediaId: 'm1', missionId: 'ms1', categoryName: 'Nứt sứ', confidenceScore: 0.91, validationStatus: 'Pending', aiSource: 'yolo', detectedAt: '2026-10-02T00:00:00Z' }],
  maintenanceHistory: [],
  stats: { totalAnomalies: 4, pendingAnomalies: 1, confirmedAnomalies: 2, openAnomalies: 3, totalTickets: 5, openTickets: 1, inProgressTickets: 1, activeTickets: 2 },
  anomaliesPagination: { page: anomalyPage, pageSize: 20, totalItems: 41, totalPages: 3 },
  maintenancePagination: { page: maintenancePage, pageSize: 20, totalItems: 0, totalPages: 1 },
});

interface DetailHarness {
  goToAnomalyPage(page: number): void;
  selectTab(tab: 'anomalies' | 'maintenance'): void;
  applyFilters(): void;
  dateRangeInvalid(): boolean;
  filters: { setValue(value: { validationStatus: string; from: string; to: string }): void };
}

describe('TowerDetail', () => {
  let fixture: ComponentFixture<TowerDetail>;
  let api: { history: ReturnType<typeof vi.fn> };

  const setup = async () => {
    TestBed.configureTestingModule({
      imports: [TowerDetail],
      providers: [
        provideRouter([]),
        provideNzIcons([AppstoreOutline, ArrowLeftOutline, AuditOutline]),
        { provide: TowersApi, useValue: api },
        { provide: Auth, useValue: { user: () => ({ id: 'u1', role: 'Analyst' }) } },
      ],
    });
    fixture = TestBed.createComponent(TowerDetail);
    fixture.componentRef.setInput('id', 't1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    api = { history: vi.fn().mockReturnValue(of(history())) };
  });

  it('loads GET /towers/{id}/history for the route id and shows live counts', async () => {
    await setup();
    expect(api.history).toHaveBeenCalledWith('t1', { page: 1, pageSize: 20, validationStatus: undefined, from: undefined, to: undefined });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('T-01');
    expect(text).toContain('Bất thường đang mở');
    expect(text).toContain('Nứt sứ');
  });

  it('sends filters and resets paging when they are applied', async () => {
    await setup();
    const component = fixture.componentInstance as unknown as DetailHarness;
    component.goToAnomalyPage(2);
    expect(api.history).toHaveBeenLastCalledWith('t1', expect.objectContaining({ page: 2 }));
    component.filters.setValue({ validationStatus: 'Confirmed', from: '2026-10-01', to: '2026-10-31' });
    component.applyFilters();
    expect(api.history).toHaveBeenLastCalledWith('t1', { page: 1, pageSize: 20, validationStatus: 'Confirmed', from: '2026-10-01', to: '2026-10-31' });
  });

  it('blocks an inverted date range', async () => {
    await setup();
    const component = fixture.componentInstance as unknown as DetailHarness;
    const calls = api.history.mock.calls.length;
    component.filters.setValue({ validationStatus: '', from: '2026-10-31', to: '2026-10-01' });
    component.applyFilters();
    expect(component.dateRangeInvalid()).toBe(true);
    expect(api.history).toHaveBeenCalledTimes(calls);
  });

  it('keeps a separate page per tab', async () => {
    await setup();
    const component = fixture.componentInstance as unknown as DetailHarness;
    // The backend applies one page number to both lists.
    api.history.mockReturnValue(of(history(3, 3)));
    component.goToAnomalyPage(3);
    component.selectTab('maintenance');
    expect(api.history).toHaveBeenLastCalledWith('t1', expect.objectContaining({ page: 1 }));
  });

  it('shows a not-found state for 404', async () => {
    api.history.mockReturnValue(throwError(() => ({ status: 404, error: { message: 'Tower not found' } })));
    await setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Không tìm thấy cột điện');
  });
});
