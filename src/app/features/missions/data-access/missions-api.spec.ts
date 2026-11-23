import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { Mission } from '../../../models/missions.models';
import { MissionsApi } from './missions-api';

describe('MissionsApi', () => {
  let api: MissionsApi;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/missions`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(MissionsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('parses mission details with tower targets, team and normalized enums', () => {
    const received: Mission[] = [];
    api.get('m1').subscribe((value) => received.push(value));
    http.expectOne(`${base}/m1`).flush({
      success: true,
      data: {
        id: 'm1',
        missionCode: 'MS-1',
        title: 'Kiểm tra',
        status: 'PendingAcceptance',
        priority: 'High',
        objective: 'IncidentFollowUp',
        targets: [{ towerId: 't1', towerCode: 'HP-001', sequence: 1, inspectionStatus: 'Pending', latitude: 20.8, longitude: 106.6 }],
        team: [
          { id: 'a1', userId: 'u1', userName: 'Inspector A', assignmentRole: 'INSPECTOR', status: 'Active', responseStatus: 'Accepted' },
          { id: 'a2', userId: 'u2', userName: 'Analyst B', assignmentRole: 'ANALYST', status: 'Active', responseStatus: 'Pending' },
        ],
      },
    });
    const mission = received[0];
    expect(mission.targets[0]).toEqual(
      expect.objectContaining({ towerId: 't1', towerCode: 'HP-001', sequence: 1, latitude: 20.8, longitude: 106.6 }),
    );
    expect(mission.status).toBe('PendingAcceptance');
    expect(mission.priority).toBe('HIGH');
    expect(mission.objective).toBe('INCIDENT_FOLLOW_UP');
    expect(mission.confirmedCount).toBe(1);
    expect(mission.totalRequiredCount).toBe(2);
  });

  it('reads pagination metadata from the list response', () => {
    let total = 0;
    let pages = 0;
    api.list({ page: 1, pageSize: 10 }).subscribe((page) => {
      total = page.totalCount;
      pages = page.totalPages;
    });
    const req = http.expectOne((r) => r.url === base);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: { items: [{ id: 'm1' }], pagination: { page: 1, pageSize: 10, totalItems: 25, totalPages: 3 } } });
    expect(total).toBe(25);
    expect(pages).toBe(3);
  });

  it('loads the inspector mission collection from the assignment-scoped endpoint', () => {
    let ids: string[] = [];
    api.my().subscribe((missions) => (ids = missions.map((mission) => mission.id)));
    http.expectOne(`${base}/my`).flush({ data: [{ id: 'assigned-1', title: 'Assigned mission', status: 'Assigned' }] });
    expect(ids).toEqual(['assigned-1']);
  });

  it('uploads media with an optional towerId', () => {
    const file = new File(['x'], 'frame.jpg', { type: 'image/jpeg' });
    let done = false;
    api.uploadMedia('m1', file, { towerId: 't1', capturedAt: '2026-10-30T00:00:00Z' }).subscribe((event) => {
      if (event.type === HttpEventType.Response) done = true;
    });
    const req = http.expectOne(`${base}/m1/media`);
    const body = req.request.body as FormData;
    expect(body.get('towerId')).toBe('t1');
    expect(body.has('assetId')).toBe(false);
    expect(body.get('capturedAt')).toBe('2026-10-30T00:00:00Z');
    req.flush({ data: { mediaId: 'md1' } });
    expect(done).toBe(true);
  });

  it('omits towerId for corridor videos', () => {
    const file = new File(['x'], 'corridor.mp4', { type: 'video/mp4' });
    api.uploadMedia('m1', file).subscribe();
    const req = http.expectOne(`${base}/m1/media`);
    expect((req.request.body as FormData).has('towerId')).toBe(false);
    req.flush({ data: {} });
  });

  it('confirms mission towers with the towers endpoint', () => {
    api.confirmTowers('m1', { boundaryWkt: 'POLYGON((0 0,1 0,1 1,0 0))', towerIds: ['t1', 't2'] }).subscribe();
    const req = http.expectOne(`${base}/m1/towers`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.towerIds).toEqual(['t1', 't2']);
    req.flush({ success: true });
  });

  it('submits incidents as JSON without attachments', () => {
    api.submitIncidentReport('m1', { incidentType: 'Collision', severity: 'High', description: 'Va quẹt cành cây', towerId: 't1' }).subscribe();
    const req = http.expectOne(`${base}/m1/incidents`);
    expect(req.request.body).toEqual({ incidentType: 'Collision', severity: 'High', description: 'Va quẹt cành cây', towerId: 't1' });
    req.flush({ data: { id: 'i1' } });
  });

  it('accepts an assignment without legacy fallbacks and reloads the mission', () => {
    api.acceptAssignment('m1').subscribe();
    http.expectOne(`${base}/m1/assignments/accept`).flush({ success: true });
    http.expectOne(`${base}/m1`).flush({ data: { id: 'm1' } });
  });
});
