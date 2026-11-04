import { signal } from '@angular/core';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { CloseCircleOutline, EditOutline, FileExcelOutline, FilterOutline, HistoryOutline, PlusOutline, ReloadOutline, SearchOutline } from '@ant-design/icons-angular/icons';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { TowerPage, TowerSummary } from '../../../../models/assets.models';
import { RegionsApi } from '../../data-access/regions-api';
import { TowersApi } from '../../data-access/towers-api';
import { TowerList } from './tower-list';

const tower: TowerSummary = { id: 't1', regionId: 'r1', regionName: 'Hải Phòng', towerCode: 'T-01', poleType: 'Thép', address: 'Số 1', latitude: 20.8, longitude: 106.6 };
const page = (items: readonly TowerSummary[]): TowerPage => ({ items, pagination: { page: 1, pageSize: 20, totalItems: items.length, totalPages: 1 } });

interface TowerListHarness {
  save(request: unknown): void;
  openEdit(tower: TowerSummary): void;
  askDelete(tower: TowerSummary): void;
  confirmDelete(): void;
  goToPage(page: number): void;
  notice(): { tone: string; text: string } | null;
  formError(): string;
  formOpen(): boolean;
}

describe('TowerList', () => {
  let fixture: ComponentFixture<TowerList>;
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; import: ReturnType<typeof vi.fn> };
  const role = signal('Manager');

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [TowerList],
      providers: [
        provideRouter([]),
        provideNzIcons([CloseCircleOutline, EditOutline, FileExcelOutline, FilterOutline, HistoryOutline, PlusOutline, ReloadOutline, SearchOutline]),
        { provide: TowersApi, useValue: api },
        { provide: RegionsApi, useValue: { getAll: () => of([{ id: 'r1', name: 'Hải Phòng' }]) } },
        { provide: Auth, useValue: { user: () => ({ id: 'u1', role: role() }) } },
      ],
    });
    fixture = TestBed.createComponent(TowerList);
    fixture.detectChanges();
  };

  beforeEach(() => {
    role.set('Manager');
    api = {
      list: vi.fn().mockReturnValue(of(page([tower]))),
      create: vi.fn().mockReturnValue(of(tower)),
      update: vi.fn().mockReturnValue(of(tower)),
      delete: vi.fn().mockReturnValue(of(undefined)),
      import: vi.fn().mockReturnValue(of({ importedCount: 3, skippedCount: 1 })),
    };
  });

  it('loads the first page on init and renders the rows', () => {
    setup();
    expect(api.list).toHaveBeenCalledWith({ page: 1, pageSize: 20, regionId: undefined, search: undefined });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('T-01');
    expect(text).toContain('Hải Phòng');
  });

  it('shows management actions only to SystemAdmin/Manager', () => {
    setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Thêm cột điện');

    TestBed.resetTestingModule();
    role.set('Inspector');
    setup();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).not.toContain('Thêm cột điện');
    expect(element.querySelector('[aria-label="Sửa cột T-01"]')).toBeNull();
  });

  it('creates a tower and reloads the list', () => {
    setup();
    const component = fixture.componentInstance as unknown as TowerListHarness;
    const request = { regionId: 'r1', towerCode: 'T-02', latitude: 21, longitude: 105 };
    component.save(request);
    expect(api.create).toHaveBeenCalledWith(request);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(component.notice()?.tone).toBe('success');
  });

  it('updates the tower being edited and surfaces backend validation errors', () => {
    api.update.mockReturnValue(throwError(() => ({ status: 400, error: { message: 'Mã cột đã tồn tại' } })));
    setup();
    const component = fixture.componentInstance as unknown as TowerListHarness;
    component.openEdit(tower);
    component.save({ regionId: 'r1', towerCode: 'T-01', latitude: 21, longitude: 105 });
    expect(api.update).toHaveBeenCalledWith('t1', expect.objectContaining({ towerCode: 'T-01' }));
    expect(component.formError()).toBe('Mã cột đã tồn tại');
    expect(component.formOpen()).toBe(true);
  });

  it('deletes after confirmation', () => {
    setup();
    const component = fixture.componentInstance as unknown as TowerListHarness;
    component.askDelete(tower);
    component.confirmDelete();
    expect(api.delete).toHaveBeenCalledWith('t1');
    expect(component.notice()?.text).toContain('T-01');
  });

  it('shows the load error state', () => {
    api.list.mockReturnValue(throwError(() => ({ status: 500, error: { message: 'Lỗi máy chủ' } })));
    setup();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Lỗi máy chủ');
  });
});
