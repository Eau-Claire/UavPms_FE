import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import {
  CheckCircleOutline,
  ClearOutline,
  CloseCircleOutline,
  CloseOutline,
  EditOutline,
  EnvironmentOutline,
  InboxOutline,
  InfoCircleOutline,
  KeyOutline,
  LeftOutline,
  LoadingOutline,
  LockOutline,
  MailOutline,
  PauseCircleOutline,
  PhoneOutline,
  PlusOutline,
  ReloadOutline,
  RightOutline,
  SearchOutline,
  UnlockOutline,
} from '@ant-design/icons-angular/icons';
import { of } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { UserRecord } from '../../../../models/users.models';
import { UsersApi } from '../../data-access/users-api';
import { UserManagement } from './user-management';

const mockUsers: readonly UserRecord[] = [
  {
    id: 'u1',
    username: 'admin',
    fullName: 'Quản trị viên Hệ thống',
    email: 'admin@uavpms.vn',
    phone: '0901234567',
    role: 'Admin',
    status: 'Active',
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'u2',
    username: 'inspector1',
    fullName: 'Trần Văn Bay',
    email: 'inspector1@uavpms.vn',
    phone: '0912345678',
    role: 'Inspector',
    status: 'Active',
    createdAt: '2026-02-15T09:30:00Z',
  },
  {
    id: 'u3',
    username: 'tech_locked',
    fullName: 'Lê Kỹ Thuật',
    email: 'tech@uavpms.vn',
    role: 'Technician',
    status: 'Locked',
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'u4',
    username: 'viewer_inactive',
    fullName: 'Phạm Người Xem',
    email: 'viewer@uavpms.vn',
    role: 'Viewer',
    status: 'Inactive',
    createdAt: '2026-03-10T11:00:00Z',
  },
];

describe('UserManagement', () => {
  let fixture: ComponentFixture<UserManagement>;
  let component: UserManagement;
  let api: {
    getAll: ReturnType<typeof vi.fn>;
    getAssignable: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    suspend: ReturnType<typeof vi.fn>;
    resetPassword: ReturnType<typeof vi.fn>;
  };
  const currentUserRole = signal('Admin');

  const setup = () => {
    TestBed.configureTestingModule({
      imports: [UserManagement],
      providers: [
        provideRouter([]),
        provideNzIcons([
          CheckCircleOutline,
          ClearOutline,
          CloseCircleOutline,
          CloseOutline,
          EditOutline,
          EnvironmentOutline,
          InboxOutline,
          InfoCircleOutline,
          KeyOutline,
          LeftOutline,
          LoadingOutline,
          LockOutline,
          MailOutline,
          PauseCircleOutline,
          PhoneOutline,
          PlusOutline,
          ReloadOutline,
          RightOutline,
          SearchOutline,
          UnlockOutline,
        ]),
        { provide: UsersApi, useValue: api },
        {
          provide: Auth,
          useValue: {
            user: () => ({ id: 'u1', role: currentUserRole() }),
            broadcastUserSuspended: vi.fn(),
            logout: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(UserManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    currentUserRole.set('Admin');
    api = {
      getAll: vi.fn().mockReturnValue(of(mockUsers)),
      getAssignable: vi.fn().mockReturnValue(of([mockUsers[1]])),
      create: vi.fn(),
      update: vi.fn(),
      suspend: vi.fn(),
      resetPassword: vi.fn(),
    };
  });

  it('loads all users on init for Admin and renders standard summary strip and rows', () => {
    setup();
    expect(api.getAll).toHaveBeenCalled();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Quản trị viên Hệ thống');
    expect(text).toContain('Trần Văn Bay');
    expect(text).toContain('Lê Kỹ Thuật');
    expect(text).toContain('Phạm Người Xem');

    // Check stats computed
    expect(component.stats()).toEqual({
      total: 4,
      active: 2,
      inactive: 1,
      locked: 1,
    });
    expect(text).toContain('4');
    expect(text).toContain('Tổng người dùng');
  });

  it('filters users by search keyword and role', () => {
    setup();
    // Search by name
    (component as unknown as { onSearch(v: string): void }).onSearch('Trần');
    fixture.detectChanges();

    let tbodyText = (fixture.nativeElement as HTMLElement).querySelector('tbody')?.textContent ?? '';
    expect(tbodyText).toContain('Trần Văn Bay');
    expect(tbodyText).not.toContain('Lê Kỹ Thuật');

    // Clear search and filter by role
    (component as unknown as { resetFilters(): void }).resetFilters();
    (component as unknown as { onRoleFilterChange(r: string): void }).onRoleFilterChange('Inspector');
    fixture.detectChanges();

    tbodyText = (fixture.nativeElement as HTMLElement).querySelector('tbody')?.textContent ?? '';
    expect(tbodyText).toContain('Trần Văn Bay');
    expect(tbodyText).not.toContain('Quản trị viên Hệ thống');
  });

  it('paginates users properly and updates start/end indices', () => {
    setup();
    const c = component as unknown as {
      changePageSize(s: number): void;
      pageSize: () => number;
      totalPages: () => number;
      totalItems: () => number;
      startIndex: () => number;
      endIndex: () => number;
      goToPage(p: number): void;
    };

    // Change page size to 2
    c.changePageSize(2);
    fixture.detectChanges();

    expect(c.totalPages()).toBe(2);
    expect(c.totalItems()).toBe(4);
    expect(c.startIndex()).toBe(1);
    expect(c.endIndex()).toBe(2);

    // Go to next page
    c.goToPage(2);
    fixture.detectChanges();

    expect(c.startIndex()).toBe(3);
    expect(c.endIndex()).toBe(4);
  });

  it('shows assignable list and scope buttons for Manager role', () => {
    currentUserRole.set('Manager');
    setup();

    expect(api.getAssignable).toHaveBeenCalled();
    expect(api.getAll).not.toHaveBeenCalled();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Phân quyền khu vực');
    expect(text).not.toContain('Thêm người dùng');
  });
});
