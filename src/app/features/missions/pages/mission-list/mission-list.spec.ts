import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  AppstoreOutline,
  FileTextOutline,
  FilterOutline,
  LeftOutline,
  PlusOutline,
  ReloadOutline,
  RightOutline,
  SearchOutline,
  ThunderboltOutline,
  UserOutline,
} from '@ant-design/icons-angular/icons';
import { Auth } from '../../../../core/auth/auth';
import { AuthUser, UserRole } from '../../../../models/auth.models';
import { Mission } from '../../../../models/missions.models';
import { NotificationsRealtime } from '../../../notifications/data-access/notifications-realtime';
import { MissionsApi } from '../../data-access/missions-api';
import { MissionList } from './mission-list';

const pendingMission = {
  id: 'm1',
  missionCode: 'MS-001',
  title: 'Tuyến A',
  routeData: '',
  assignedToUserId: '',
  assignedToUsername: '',
  droneCode: '',
  status: 'PendingAcceptance',
  description: '',
  managerId: 'mgr',
  managerUsername: '',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: null,
  targets: [],
  priority: 'NORMAL',
  team: [{ id: 'a1', userId: 'u-me', userName: 'Me', assignmentRole: 'INSPECTOR', status: 'Active', responseStatus: 'PENDING' }],
} as unknown as Mission;

describe('MissionList', () => {
  let fixture: ComponentFixture<MissionList>;
  let api: { list: ReturnType<typeof vi.fn>; my: ReturnType<typeof vi.fn> };

  const setup = (role: string) => {
    const user: AuthUser = { id: 'u-me', email: 'me@example.test', fullName: 'Me', role: role as UserRole, mustChangePassword: false };
    api = {
      list: vi.fn(() => of({ items: [pendingMission], page: 1, pageSize: 8, totalCount: 1, totalPages: 1 })),
      my: vi.fn(() => of([pendingMission])),
    };
    TestBed.configureTestingModule({
      imports: [MissionList],
      providers: [
        provideRouter([]),
        provideNzIcons([
          AppstoreOutline,
          FileTextOutline,
          FilterOutline,
          LeftOutline,
          PlusOutline,
          ReloadOutline,
          RightOutline,
          SearchOutline,
          ThunderboltOutline,
          UserOutline,
        ]),
        { provide: MissionsApi, useValue: api },
        { provide: Auth, useValue: { user: signal(user) } },
        { provide: NotificationsRealtime, useValue: { connect: vi.fn(), missionEvents$: new Subject() } },
      ],
    });
    fixture = TestBed.createComponent(MissionList);
    fixture.detectChanges();
  };

  const scopeButtons = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.mission-scope-tab') as NodeListOf<HTMLElement>).map((el) =>
      el.textContent!.trim(),
    );

  it('shows only "my missions" to an Inspector and never calls GET /missions', () => {
    setup('Inspector');
    expect(scopeButtons()).toEqual(['Nhiệm vụ của tôi']);
    expect(api.my).toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it('shows only "my missions" to a Technician', () => {
    setup('MaintenanceTechnician');
    expect(scopeButtons()).toEqual(['Nhiệm vụ của tôi']);
    expect(api.list).not.toHaveBeenCalled();
  });

  it('shows both tabs to an Analyst and to a Manager', () => {
    setup('Analyst');
    expect(scopeButtons()).toEqual(['Nhiệm vụ của tôi', 'Tất cả nhiệm vụ']);
    TestBed.resetTestingModule();
    setup('Manager');
    expect(scopeButtons()).toEqual(['Nhiệm vụ của tôi', 'Tất cả nhiệm vụ']);
    expect(api.list).toHaveBeenCalled();
  });

  it('sends an Inspector with a pending assignment to the acceptance page', () => {
    setup('Inspector');
    const link = fixture.nativeElement.querySelector('a.mission-code') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/missions/m1/inspector');
  });

  it('sends a Manager to the mission dashboard', () => {
    setup('Manager');
    const link = fixture.nativeElement.querySelector('a.mission-code') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/missions/m1');
  });
});
