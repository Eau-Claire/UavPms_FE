import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { UsersApi } from '../../../users/data-access/users-api';
import { Mission } from '../../../../models/missions.models';
import { MissionTargetSelection } from '../../data-access/mission-target-selection';
import { MissionsApi } from '../../data-access/missions-api';
import { MissionCreate } from './mission-create';

interface CreateHarness {
  save(): void;
  error(): string;
  form: { patchValue(value: Record<string, string>): void };
}

describe('MissionCreate', () => {
  let fixture: ComponentFixture<MissionCreate>;
  let create: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let store: MissionTargetSelection;
  const response = { id: 'm1', targets: [] } as unknown as Mission;

  beforeEach(() => {
    create = vi.fn().mockReturnValue(of(response));
    TestBed.configureTestingModule({ imports: [MissionCreate], providers: [
      { provide: MissionsApi, useValue: { create } }, { provide: UsersApi, useValue: { getAssignable: () => of([]) } },
      { provide: Auth, useValue: { user: () => ({ id: 'u1', email: 'user@test' }) } },
      provideRouter([]),
    ] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MissionCreate); store = TestBed.inject(MissionTargetSelection); store.clear();
  });

  it('blocks submission without target assets', () => {
    const component = fixture.componentInstance as unknown as CreateHarness;
    component.form.patchValue({ name: 'Mission', scheduledAt: '2026-09-03T08:00', inspectorId: 'u1', droneId: 'd1' }); component.save();
    expect(create).not.toHaveBeenCalled(); expect(component.error()).toContain('ít nhất một tài sản');
  });

  it('submits selected IDs and follows success navigation', () => {
    const component = fixture.componentInstance as unknown as CreateHarness;
    store.add({ assetId: 'a1', code: 'A-1', name: 'Tower', latitude: 21, longitude: 105, status: 'Operational' });
    component.form.patchValue({ name: 'Mission', scheduledAt: '2026-09-03T08:00', inspectorId: 'u1', droneId: 'd1' }); component.save();
    expect(create.mock.calls[0][0].targetAssetIds).toEqual(['a1']); expect(navigate).toHaveBeenCalledWith(['/missions', 'm1']);
  });

  it('displays backend validation errors', () => {
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ error: { message: 'Asset unavailable' }, status: 400 })));
    const component = fixture.componentInstance as unknown as CreateHarness;
    store.add({ assetId: 'a1', code: 'A-1', name: 'Tower', latitude: 21, longitude: 105, status: 'Operational' });
    component.form.patchValue({ name: 'Mission', scheduledAt: '2026-09-03T08:00', inspectorId: 'u1', droneId: 'd1' }); component.save();
    expect(component.error()).toContain('Asset unavailable');
  });
});
