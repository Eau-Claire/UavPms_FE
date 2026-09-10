import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { MissionsApi } from './missions-api';

describe('MissionsApi', () => {
  it('creates a mission with target asset IDs and parses mission targets', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(MissionsApi); const http = TestBed.inject(HttpTestingController);
    const body = { name: 'Inspection', description: '', scheduledAt: '2026-09-03T01:00:00.000Z', plannedEnd: '2026-09-03T03:00:00.000Z',
      regionId: 'r1', missionType: 'AD_HOC' as const, inspectorId: 'u1', droneId: 'd1', targetAssetIds: ['a1', 'a2'],
      boundaryWkt: 'POLYGON((105 10,106 10,106 11,105 11,105 10))' };
    let targetName = '';
    api.create(body).subscribe((mission) => targetName = mission.targets[0]?.assetName ?? '');
    const request = http.expectOne(`${environment.apiBaseUrl}/missions`);
    expect(request.request.body.regionId).toBe('r1');
    expect(request.request.body.targetAssetIds).toBeUndefined();
    request.flush({ data: 'm1' });
    const assets = http.expectOne(`${environment.apiBaseUrl}/missions/m1/assets`);
    expect(assets.request.body.assetIds).toEqual(['a1', 'a2']); assets.flush({ data: null });
    const assignment = http.expectOne(`${environment.apiBaseUrl}/missions/m1/assignments`);
    expect(assignment.request.body).toEqual({ userId: 'u1', assignmentRole: 'Inspector' }); assignment.flush({ data: null });
    const drone = http.expectOne(`${environment.apiBaseUrl}/missions/m1/drone`);
    expect(drone.request.body).toEqual({ droneId: 'd1' }); drone.flush({ data: null });
    const detail = http.expectOne(`${environment.apiBaseUrl}/missions/m1`);
    detail.flush({ data: { id: 'm1', name: 'Inspection', missionTargets: [{ assetId: 'a1', assetName: 'Tower 1', sequence: 1, inspectionStatus: 'Pending' }] } });
    expect(targetName).toBe('Tower 1'); http.verify();
  });

  it('loads the inspector mission collection from the assignment-scoped endpoint', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(MissionsApi); const http = TestBed.inject(HttpTestingController);
    let ids: string[] = [];
    api.my().subscribe((missions) => { ids = missions.map((mission) => mission.id); });
    const request = http.expectOne(`${environment.apiBaseUrl}/missions/my`);
    request.flush({ data: [{ id: 'assigned-1', title: 'Assigned mission', status: 'Pending' }] });
    expect(ids).toEqual(['assigned-1']);
    http.verify();
  });
});
