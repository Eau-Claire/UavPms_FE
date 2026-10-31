import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ArrowLeftOutline, CheckCircleOutline, SafetyCertificateOutline, ToolOutline } from '@ant-design/icons-angular/icons';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { of, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { MaintenanceTicket } from '../../../../models/maintenance.models';
import { buildTimeline } from '../../components/ticket-timeline/ticket-timeline';
import { MaintenanceApi } from '../../data-access/maintenance-api';
import { MaintenanceDetail } from './maintenance-detail';

const proof = { id: 'p1', proofType: 'After', fileUrl: 'https://img/p1.jpg', technicianNotes: 'Đã thay', uploadedAt: '2026-10-31T03:00:00Z' };

const ticket = (overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket => ({
  id: 't1',
  ticketCode: 'TKT-1',
  anomalyId: 'a1',
  managerId: 'm1',
  status: 'Open',
  priority: 'High',
  description: 'Nứt sứ cách điện',
  createdAt: '2026-10-31T00:00:00Z',
  tower: { id: 'tw1', towerCode: 'T-01' },
  towerId: 'tw1',
  anomaly: { id: 'a1', validationStatus: 'Confirmed', confidenceScore: 87, missionId: 'ms1', categoryName: 'Nứt sứ', isEmergencyClass: false, imageUrl: 'https://img/a1.jpg' },
  proofs: [],
  materials: [],
  ...overrides,
});

interface DetailHarness {
  ask(action: 'start' | 'submit' | 'close'): void;
  runAction(): void;
}

describe('MaintenanceDetail', () => {
  let fixture: ComponentFixture<MaintenanceDetail>;
  let api: Record<'get' | 'technicians' | 'assign' | 'updateStatus' | 'close' | 'uploadProof' | 'logMaterial', ReturnType<typeof vi.fn>>;

  const setup = async (role: string, data: MaintenanceTicket, userId = 'u1') => {
    api.get.mockReturnValue(of(data));
    TestBed.configureTestingModule({
      imports: [MaintenanceDetail],
      providers: [
        provideRouter([]),
        provideNzIcons([ArrowLeftOutline, CheckCircleOutline, SafetyCertificateOutline, ToolOutline]),
        { provide: MaintenanceApi, useValue: api },
        { provide: Auth, useValue: { user: () => ({ id: userId, role }) } },
      ],
    });
    fixture = TestBed.createComponent(MaintenanceDetail);
    fixture.componentRef.setInput('id', 't1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const element = () => fixture.nativeElement as HTMLElement;
  const text = () => element().textContent ?? '';
  const button = (label: string) =>
    Array.from(element().querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label)) as HTMLButtonElement | undefined;

  beforeEach(() => {
    api = {
      get: vi.fn(),
      technicians: vi.fn().mockReturnValue(of([{ id: 'tech1', fullName: 'Nguyễn Văn Thợ', email: 't@x.vn', activeTicketCount: 2 }])),
      assign: vi.fn().mockReturnValue(of(ticket({ technicianId: 'tech1' }))),
      updateStatus: vi.fn().mockReturnValue(of(ticket({ status: 'InProgress' }))),
      close: vi.fn().mockReturnValue(of(ticket({ status: 'Closed' }))),
      uploadProof: vi.fn(),
      logMaterial: vi.fn(),
    };
  });

  it('shows ticket info with tower and mission links', async () => {
    await setup('Manager', ticket());
    expect(api.get).toHaveBeenCalledWith('t1');
    expect(text()).toContain('TKT-1');
    expect(text()).toContain('Chờ xử lý');
    const links = Array.from(element().querySelectorAll('a')).map((anchor) => anchor.getAttribute('href'));
    expect(links).toContain('/towers/tw1');
    expect(links).toContain('/missions/ms1');
  });

  it('lets a manager assign an unassigned Open ticket; start is blocked until a technician is assigned', async () => {
    await setup('Manager', ticket());
    expect(api.technicians).toHaveBeenCalled();
    expect(text()).toContain('Giao kỹ thuật viên');
    expect(text()).toContain('Nguyễn Văn Thợ — 2 phiếu chưa đóng');
    expect(button('Bắt đầu sửa chữa')?.disabled).toBe(true);
    expect(button('Gửi nghiệm thu')).toBeUndefined();
    expect(button('Nghiệm thu & đóng phiếu')).toBeUndefined();
  });

  it('lets the assigned technician start an Open ticket but not assign it', async () => {
    await setup('Technician', ticket({ technicianId: 'u1' }));
    expect(api.technicians).not.toHaveBeenCalled();
    expect(element().querySelector('app-assign-technician')).toBeNull();
    const start = button('Bắt đầu sửa chữa');
    expect(start?.disabled).toBe(false);

    const component = fixture.componentInstance as unknown as DetailHarness;
    component.ask('start');
    component.runAction();
    expect(api.updateStatus).toHaveBeenCalledWith('t1', 'InProgress');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('disables "Gửi nghiệm thu" until a proof exists and shows the evidence forms while in progress', async () => {
    await setup('MaintenanceTechnician', ticket({ technicianId: 'u1', status: 'InProgress' }));
    expect(button('Gửi nghiệm thu')?.disabled).toBe(true);
    expect(element().querySelector('app-proof-upload')).not.toBeNull();
    expect(element().querySelector('app-material-form')).not.toBeNull();
  });

  it('enables "Gửi nghiệm thu" when a proof exists and submits PendingVerification', async () => {
    await setup('Technician', ticket({ technicianId: 'u1', status: 'InProgress', proofs: [proof] }));
    expect(button('Gửi nghiệm thu')?.disabled).toBe(false);
    expect(element().querySelector('.md-gallery img')?.getAttribute('src')).toBe('https://img/p1.jpg');
    const component = fixture.componentInstance as unknown as DetailHarness;
    component.ask('submit');
    component.runAction();
    expect(api.updateStatus).toHaveBeenCalledWith('t1', 'PendingVerification');
  });

  it('keeps a technician who is not assigned to the ticket read-only', async () => {
    await setup('Technician', ticket({ technicianId: 'someone-else', status: 'InProgress' }));
    expect(text()).toContain('Phiếu này không được giao cho bạn');
    expect(button('Gửi nghiệm thu')).toBeUndefined();
    expect(element().querySelector('app-proof-upload')).toBeNull();
  });

  it('lets a manager close a ticket awaiting verification', async () => {
    await setup('Manager', ticket({ technicianId: 'tech1', status: 'PendingVerification', proofs: [proof] }));
    expect(button('Nghiệm thu & đóng phiếu')?.disabled).toBe(false);
    const component = fixture.componentInstance as unknown as DetailHarness;
    component.ask('close');
    component.runAction();
    expect(api.close).toHaveBeenCalledWith('t1');
  });

  it('does not offer closing to a technician', async () => {
    await setup('Technician', ticket({ technicianId: 'u1', status: 'PendingVerification', proofs: [proof] }));
    expect(button('Nghiệm thu & đóng phiếu')).toBeUndefined();
  });

  it('shows the Vietnamese error when an action fails', async () => {
    api.updateStatus.mockReturnValue(throwError(() => ({ status: 400, error: { errorCode: 'Cannot submit ticket for verification without repair proof photo', message: 'Cannot submit ticket for verification without repair proof photo' } })));
    await setup('Manager', ticket({ technicianId: 'tech1', status: 'InProgress', proofs: [proof] }));
    const component = fixture.componentInstance as unknown as DetailHarness;
    component.ask('submit');
    component.runAction();
    fixture.detectChanges();
    expect(text()).toContain('Cần tải lên ít nhất một ảnh minh chứng sau sửa chữa.');
  });

  it('shows a not-found state for 404', async () => {
    api.get.mockReturnValue(throwError(() => ({ status: 404, error: { message: 'Maintenance ticket not found' } })));
    TestBed.configureTestingModule({
      imports: [MaintenanceDetail],
      providers: [provideRouter([]), provideNzIcons([ArrowLeftOutline]), { provide: MaintenanceApi, useValue: api }, { provide: Auth, useValue: { user: () => ({ id: 'u1', role: 'Manager' }) } }],
    });
    fixture = TestBed.createComponent(MaintenanceDetail);
    fixture.componentRef.setInput('id', 'missing');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).toContain('Không tìm thấy phiếu bảo trì');
  });
});

describe('buildTimeline', () => {
  it('marks done steps and the current step', () => {
    const steps = buildTimeline(ticket({ technicianId: 'u1', status: 'InProgress', startedAt: '2026-10-31T02:00:00Z' }));
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'current', 'pending']);
  });

  it('points at assignment for an unassigned Open ticket', () => {
    expect(buildTimeline(ticket()).map((step) => step.state)).toEqual(['done', 'current', 'pending', 'pending', 'pending']);
  });

  it('completes every step for a closed ticket', () => {
    const steps = buildTimeline(ticket({ technicianId: 'u1', status: 'Closed', resolvedAt: '2026-11-01T00:00:00Z' }));
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });
});
