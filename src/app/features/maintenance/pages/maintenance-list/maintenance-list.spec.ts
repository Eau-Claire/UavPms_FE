import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReloadOutline, RightOutline } from '@ant-design/icons-angular/icons';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { MaintenanceTicket } from '../../../../models/maintenance.models';
import { MaintenanceApi } from '../../data-access/maintenance-api';
import { MaintenanceList } from './maintenance-list';

const ticket = (overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket => ({
  id: 't1',
  ticketCode: 'TKT-20261031-0001',
  anomalyId: 'a1',
  managerId: 'm1',
  status: 'Open',
  priority: 'High',
  description: '[AI Review] Nứt sứ cách điện',
  createdAt: '2026-10-31T00:00:00Z',
  proofs: [],
  materials: [],
  ...overrides,
});

interface ListHarness {
  goToPage(index: number): void;
  filters: { setValue(value: { status: string; priority: string }): void };
}

describe('MaintenanceList', () => {
  let fixture: ComponentFixture<MaintenanceList>;
  let api: { list: ReturnType<typeof vi.fn>; mine: ReturnType<typeof vi.fn>; technicians: ReturnType<typeof vi.fn> };

  const setup = async (role: string) => {
    TestBed.configureTestingModule({
      imports: [MaintenanceList],
      providers: [
        provideRouter([]),
        provideNzIcons([ReloadOutline, RightOutline]),
        { provide: MaintenanceApi, useValue: api },
        { provide: Auth, useValue: { user: () => ({ id: 'u1', role }) } },
      ],
    });
    fixture = TestBed.createComponent(MaintenanceList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    api = {
      list: vi.fn().mockReturnValue(of({
        items: [ticket(), ticket({ id: 't2', ticketCode: 'TKT-2', status: 'InProgress', priority: 'Emergency', technicianId: 'tech1' })],
        totalCount: 45,
        pageIndex: 0,
        pageSize: 20,
      })),
      mine: vi.fn().mockReturnValue(of([
        ticket({ id: 'm1', ticketCode: 'TKT-MY-1', technicianId: 'u1', status: 'InProgress' }),
        ticket({ id: 'm2', ticketCode: 'TKT-MY-2', technicianId: 'u1', status: 'Closed', priority: 'Low' }),
      ])),
      technicians: vi.fn().mockReturnValue(of([{ id: 'tech1', fullName: 'Nguyễn Văn Thợ', email: 't@x.vn', activeTicketCount: 2 }])),
    };
  });

  it('shows all tickets to a manager, with technician names and unassigned Open tickets highlighted', async () => {
    await setup('Manager');
    expect(api.list).toHaveBeenCalledWith({ pageIndex: 0, pageSize: 20, status: '', priority: '' });
    expect(api.mine).not.toHaveBeenCalled();
    expect(text()).toContain('TKT-20261031-0001');
    expect(text()).toContain('Chưa giao');
    expect(text()).toContain('Nguyễn Văn Thợ');
    expect(text()).toContain('Khẩn cấp');
    expect(text()).toContain('Đang sửa chữa');
    const highlighted = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.row-unassigned');
    expect(highlighted.length).toBe(1);
    expect(text()).toContain('1 phiếu trên trang này chưa được giao');
  });

  it('sends filters and the 0-based page to GET /maintenance/tickets', async () => {
    await setup('SystemAdmin');
    const component = fixture.componentInstance as unknown as ListHarness;
    component.goToPage(1);
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageIndex: 1 }));
    component.filters.setValue({ status: 'PendingVerification', priority: 'Emergency' });
    expect(api.list).toHaveBeenLastCalledWith({ pageIndex: 0, pageSize: 20, status: 'PendingVerification', priority: 'Emergency' });
  });

  it('shows a technician only their own tickets from /my and filters them in the browser', async () => {
    await setup('Technician');
    expect(api.mine).toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.technicians).not.toHaveBeenCalled();
    expect(text()).toContain('Phiếu bảo trì của tôi');
    expect(text()).toContain('TKT-MY-1');
    expect(text()).toContain('TKT-MY-2');
    const component = fixture.componentInstance as unknown as ListHarness;
    component.filters.setValue({ status: 'Closed', priority: '' });
    fixture.detectChanges();
    expect(text()).not.toContain('TKT-MY-1');
    expect(text()).toContain('TKT-MY-2');
  });

  it('shows the backend error', async () => {
    api.list.mockReturnValue(throwError(() => ({ status: 403, error: null })));
    await setup('Manager');
    expect(text()).toContain('Bạn không có quyền thực hiện thao tác này.');
  });
});
