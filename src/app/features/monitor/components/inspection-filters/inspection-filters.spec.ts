import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../../core/auth/auth';
import { normalizeMission, MissionsApi } from '../../../missions/data-access/missions-api';
import { InspectionFilterChange, InspectionFilters, MissionOption, resolveMissionInput } from './inspection-filters';

const GUID = '2c52a953-3606-4f8a-bd13-76cfab48d133';
const options: MissionOption[] = [{ id: GUID, code: 'NV-001', title: 'Tuyến 110kV Hòa Khánh', label: 'NV-001 — Tuyến 110kV Hòa Khánh' }];

describe('resolveMissionInput', () => {
  it('resolves a GUID, a picked label, a code or an exact title to the mission id', () => {
    expect(resolveMissionInput(GUID, [])).toEqual({ id: GUID, label: GUID });
    expect(resolveMissionInput('NV-001 — Tuyến 110kV Hòa Khánh', options)?.id).toBe(GUID);
    expect(resolveMissionInput('nv-001', options)?.id).toBe(GUID);
    expect(resolveMissionInput('tuyến 110kv hòa khánh', options)?.id).toBe(GUID);
  });

  it('returns null for free text that matches no mission', () => {
    expect(resolveMissionInput('Hòa Khánh', options)).toBeNull();
    expect(resolveMissionInput('   ', options)).toBeNull();
  });
});

describe('InspectionFilters', () => {
  async function setup(role: string) {
    const missionsApi = {
      list: vi.fn().mockReturnValue(of({ items: [normalizeMission({ id: GUID, missionCode: 'NV-001', title: 'Tuyến 110kV Hòa Khánh', status: 'Completed' })], page: 1, pageSize: 100, totalCount: 1, totalPages: 1 })),
      my: vi.fn().mockReturnValue(of([])),
    };
    await TestBed.configureTestingModule({
      imports: [InspectionFilters],
      providers: [
        { provide: MissionsApi, useValue: missionsApi },
        { provide: Auth, useValue: { user: signal({ id: 'u1', email: 'u@evn.vn', fullName: 'U', role, mustChangePassword: false }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InspectionFilters);
    const emitted: InspectionFilterChange[] = [];
    fixture.componentInstance.filtersChanged.subscribe((change) => emitted.push(change));
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input[formcontrolname="mission"]') as HTMLInputElement;
    const submit = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    };
    return { el, missionsApi, emitted, submit };
  }

  it('offers all missions to managers and sends the picked mission id', async () => {
    const { el, missionsApi, emitted, submit } = await setup('Manager');
    expect(missionsApi.list).toHaveBeenCalled();
    expect(el.querySelectorAll('datalist option').length).toBe(1);
    submit('NV-001 — Tuyến 110kV Hòa Khánh');
    expect(emitted.at(-1)).toMatchObject({ filters: { missionId: GUID }, missionSearch: '' });
  });

  it('uses my missions for inspectors and keeps unmatched text as a client-side search', async () => {
    const { missionsApi, emitted, submit } = await setup('Inspector');
    expect(missionsApi.my).toHaveBeenCalled();
    expect(missionsApi.list).not.toHaveBeenCalled();
    submit('Hòa Khánh');
    expect(emitted.at(-1)).toMatchObject({ filters: { missionId: '' }, missionSearch: 'Hòa Khánh' });
  });
});
