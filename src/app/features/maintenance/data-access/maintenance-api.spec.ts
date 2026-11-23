import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { MaintenanceTicket, MaintenanceTicketPage } from '../../../models/maintenance.models';
import { MaintenanceApi, maintenanceErrorMessage, toDueDateIso } from './maintenance-api';

describe('MaintenanceApi', () => {
  const url = `${environment.apiBaseUrl}/maintenance/tickets`;
  let api: MaintenanceApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MaintenanceApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists tickets with a 0-based pageIndex and optional status/priority', () => {
    let result: MaintenanceTicketPage | undefined;
    api.list({ pageIndex: 2, pageSize: 10, status: 'Open', priority: '' }).subscribe((value) => (result = value));
    const request = http.expectOne((req) => req.url === url);
    expect(request.request.params.get('pageIndex')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('10');
    expect(request.request.params.get('status')).toBe('Open');
    expect(request.request.params.has('priority')).toBe(false);
    request.flush({
      success: true,
      data: {
        items: [{ id: 't1', ticketCode: 'TKT-1', anomalyId: 'a1', towerId: null, managerId: 'm1', technicianId: null, status: 'Open', priority: 'High', description: 'Nứt sứ', dueDate: '2026-11-07T00:00:00Z', createdAt: '2026-10-31T00:00:00Z', maintenanceProofs: [], materialLogs: [] }],
        totalCount: 21,
        pageIndex: 2,
        pageSize: 10,
      },
    });
    expect(result?.totalCount).toBe(21);
    expect(result?.pageIndex).toBe(2);
    expect(result?.items[0]).toEqual(expect.objectContaining({ id: 't1', ticketCode: 'TKT-1', technicianId: undefined, towerId: undefined, status: 'Open', proofs: [], materials: [] }));
  });

  it('loads the technician\'s own tickets from /my', () => {
    let result: readonly MaintenanceTicket[] = [];
    api.mine().subscribe((value) => (result = value));
    http.expectOne(`${url}/my`).flush({ data: [{ id: 't1', ticketCode: 'TKT-1', status: 'InProgress', priority: 'Low', technicianId: 'u1' }] });
    expect(result.map((ticket) => ticket.technicianId)).toEqual(['u1']);
  });

  it('normalizes the detail payload: tower, anomaly (confidence %, bounding box), people, proofs and materials', () => {
    let ticket: MaintenanceTicket | undefined;
    api.get('t1').subscribe((value) => (ticket = value));
    http.expectOne(`${url}/t1`).flush({
      data: {
        id: 't1', ticketCode: 'TKT-1', anomalyId: 'a1', towerId: null, managerId: 'm1', technicianId: 'u1', status: 'InProgress', priority: 'Emergency',
        description: 'x', createdAt: '2026-10-31T00:00:00Z',
        tower: { id: 'tw1', towerCode: 'T-01', poleType: 'Thép', regionId: 'r1' },
        anomaly: { id: 'a1', validationStatus: 'Confirmed', confidenceScore: 0.87, mediaId: 'md1', missionId: 'ms1', categoryName: 'Nứt sứ', isEmergencyClass: true, imageUrl: 'https://img/1.jpg', boundingBox: '{"x":0.1,"y":0.2,"width":0.3,"height":0.4}' },
        manager: { id: 'm1', email: 'm@x.vn', fullName: 'Quản lý' },
        technician: { id: 'u1', email: 't@x.vn', fullName: 'Kỹ thuật' },
        maintenanceProofs: [{ id: 'p1', proofType: 'After', fileUrl: 'https://img/p1.jpg', technicianNotes: 'ok', uploadedAt: '2026-10-31T01:00:00Z' }],
        materialLogs: [{ id: 'ml1', componentName: 'Sứ cách điện', componentCode: 'SU-01', quantityUsed: 2, unit: 'cái', fieldObservations: '', loggedAt: '2026-10-31T02:00:00Z' }],
      },
    });
    expect(ticket?.towerId).toBe('tw1');
    expect(ticket?.tower?.towerCode).toBe('T-01');
    expect(ticket?.anomaly?.confidenceScore).toBeCloseTo(87);
    expect(ticket?.anomaly?.missionId).toBe('ms1');
    expect(ticket?.anomaly?.isEmergencyClass).toBe(true);
    expect(ticket?.anomaly?.boundingBox).toEqual(expect.objectContaining({ isNormalized: true }));
    expect(ticket?.anomaly?.boundingBox?.x).toBeCloseTo(10);
    expect(ticket?.anomaly?.boundingBox?.width).toBeCloseTo(30);
    expect(ticket?.technician?.fullName).toBe('Kỹ thuật');
    expect(ticket?.proofs[0].fileUrl).toBe('https://img/p1.jpg');
    expect(ticket?.materials[0]).toEqual(expect.objectContaining({ componentName: 'Sứ cách điện', quantityUsed: 2, unit: 'cái' }));
  });

  it('lists technicians with their active ticket count', () => {
    let result: unknown;
    api.technicians().subscribe((value) => (result = value));
    http.expectOne(`${url}/technicians`).flush({ data: [{ id: 'u1', fullName: 'A', email: 'a@x.vn', activeTicketCount: 3 }] });
    expect(result).toEqual([{ id: 'u1', fullName: 'A', email: 'a@x.vn', activeTicketCount: 3 }]);
  });

  it('assigns a technician with the due date as a UTC instant at the end of the local day', () => {
    api.assign('t1', { technicianId: 'u1', dueDate: '2026-11-05' }).subscribe();
    const request = http.expectOne(`${url}/t1/assign`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.technicianId).toBe('u1');
    expect(request.request.body.dueDate).toBe(new Date('2026-11-05T23:59:59').toISOString());
    request.flush({ data: { id: 't1', status: 'Open', technicianId: 'u1' } });

    api.assign('t1', { technicianId: 'u2' }).subscribe();
    const second = http.expectOne(`${url}/t1/assign`);
    expect(second.request.body).toEqual({ technicianId: 'u2', dueDate: undefined });
    second.flush({ data: { id: 't1' } });
  });

  it('changes status, logs materials and closes with the controller bodies', () => {
    api.updateStatus('t1', 'InProgress').subscribe();
    const status = http.expectOne(`${url}/t1/status`);
    expect(status.request.method).toBe('PUT');
    expect(status.request.body).toEqual({ status: 'InProgress' });
    status.flush({ data: { id: 't1', status: 'InProgress' } });

    api.logMaterial('t1', { componentName: ' Sứ ', componentCode: '', quantityUsed: 2, unit: ' cái ', fieldObservations: ' ' }).subscribe();
    const material = http.expectOne(`${url}/t1/materials`);
    expect(material.request.method).toBe('POST');
    expect(material.request.body).toEqual({ componentName: 'Sứ', componentCode: undefined, quantityUsed: 2, unit: 'cái', fieldObservations: undefined });
    material.flush({ data: { id: 'ml1', componentName: 'Sứ', quantityUsed: 2, unit: 'cái' } });

    api.close('t1').subscribe();
    const close = http.expectOne(`${url}/t1/close`);
    expect(close.request.method).toBe('PUT');
    close.flush({ data: { id: 't1', status: 'Closed' } });
  });

  it('uploads a proof as multipart "file" + "technicianNotes"', () => {
    let fileUrl = '';
    api.uploadProof('t1', new File(['x'], 'after.jpg', { type: 'image/jpeg' }), ' Đã thay sứ ').subscribe((proof) => (fileUrl = proof.fileUrl));
    const request = http.expectOne(`${url}/t1/proof`);
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect(body.get('technicianNotes')).toBe('Đã thay sứ');
    request.flush({ data: { id: 'p1', fileUrl: 'http://minio/p1.jpg', technicianNotes: 'Đã thay sứ', uploadedAt: '2026-10-31T00:00:00Z' } });
    expect(fileUrl).toBe('http://minio/p1.jpg');
  });

  it('maps backend errors to Vietnamese messages', () => {
    const error = (status: number, body: unknown) => new HttpErrorResponse({ status, error: body });
    expect(maintenanceErrorMessage(error(400, { errorCode: 'TICKET_NOT_OPEN', message: "TICKET_NOT_OPEN: Only open tickets can be (re)assigned; this ticket is 'InProgress'." }), 'f'))
      .toBe('Chỉ có thể giao kỹ thuật viên cho phiếu đang chờ xử lý.');
    expect(maintenanceErrorMessage(error(400, { errorCode: 'Cannot submit ticket for verification without repair proof photo', message: 'Cannot submit ticket for verification without repair proof photo' }), 'f'))
      .toBe('Cần tải lên ít nhất một ảnh minh chứng sau sửa chữa.');
    expect(maintenanceErrorMessage(error(403, { errorCode: 'FORBIDDEN', message: 'Technician is not assigned to this ticket' }), 'f')).toBe('Bạn không được giao phiếu bảo trì này.');
    expect(maintenanceErrorMessage(error(403, null), 'f')).toBe('Bạn không có quyền thực hiện thao tác này.');
    expect(maintenanceErrorMessage(error(0, null), 'f')).toBe('Không thể kết nối đến máy chủ.');
    expect(maintenanceErrorMessage(error(500, { errorCode: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }), 'fallback')).toBe('fallback');
  });

  it('keeps ISO due dates as they are', () => {
    expect(toDueDateIso('2026-11-05T10:00:00Z')).toBe('2026-11-05T10:00:00.000Z');
  });
});
