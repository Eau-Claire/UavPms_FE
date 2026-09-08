import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogPage } from '../../../../models/audit.models';
import { AuditApi } from '../../data-access/audit-api';
import { AuditLogViewer, FieldDiff } from './audit-log-viewer';

describe('AuditLogViewer', () => {
  let component: AuditLogViewer;
  let mockAuditApi: { list: ReturnType<typeof vi.fn> };

  const mockPage: AuditLogPage = {
    items: [
      {
        id: 'rec-1',
        userId: 'usr-1',
        operatorEmail: 'admin@uavpms.com',
        tableName: 'Missions',
        recordId: 'm-100',
        actionType: 'Modified',
        oldValues: '{"Status":"Pending","AssignedTo":null}',
        newValues: '{"Status":"InProgress","AssignedTo":"user-2"}',
        ipAddress: '192.168.1.10',
        userAgent: 'Mozilla/5.0',
        createdAt: '2026-09-07T08:00:00.000Z',
      },
    ],
    pagination: {
      page: 1,
      pageSize: 10,
      totalItems: 1,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    mockAuditApi = {
      list: vi.fn().mockReturnValue(of(mockPage)),
    };

    TestBed.configureTestingModule({
      providers: [
        AuditLogViewer,
        { provide: AuditApi, useValue: mockAuditApi },
      ],
    });

    component = TestBed.inject(AuditLogViewer);
  });

  const getInternal = (comp: AuditLogViewer) => comp as unknown as {
    records: () => unknown[];
    loading: () => boolean;
    error: () => string;
    filterForm: { setValue: (val: unknown) => void; getRawValue: () => unknown };
    applyFilters: () => void;
    resetFilters: () => void;
    openDetail: (rec: unknown) => void;
    currentDiff: () => readonly FieldDiff[];
    fetchLogs: () => void;
  };

  it('loads audit logs upon instantiation', () => {
    expect(mockAuditApi.list).toHaveBeenCalled();
    const internal = getInternal(component);
    expect(internal.records().length).toBe(1);
    expect(internal.loading()).toBe(false);
  });

  it('updates filters and requests page 1 when applyFilters is called', () => {
    const internal = getInternal(component);
    internal.filterForm.setValue({
      search: 'Missions',
      actionType: 'Modified',
      tableName: 'Missions',
    });

    internal.applyFilters();

    expect(mockAuditApi.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        search: 'Missions',
        actionType: 'Modified',
        tableName: 'Missions',
      }),
    );
  });

  it('resets form and reloads when resetFilters is called', () => {
    const internal = getInternal(component);
    internal.resetFilters();

    expect(internal.filterForm.getRawValue()).toEqual({
      search: '',
      actionType: '',
      tableName: '',
    });
    expect(mockAuditApi.list).toHaveBeenCalled();
  });

  it('computes field diff correctly when a record is selected', () => {
    const internal = getInternal(component);
    internal.openDetail(mockPage.items[0]);

    const diff = internal.currentDiff();
    expect(diff.length).toBe(2);

    const statusDiff = diff.find((d) => d.key === 'Status');
    expect(statusDiff).toBeDefined();
    expect(statusDiff?.oldValue).toBe('Pending');
    expect(statusDiff?.newValue).toBe('InProgress');
    expect(statusDiff?.status).toBe('modified');

    const assignDiff = diff.find((d) => d.key === 'AssignedTo');
    expect(assignDiff).toBeDefined();
    expect(assignDiff?.oldValue).toBe('null');
    expect(assignDiff?.newValue).toBe('user-2');
    expect(assignDiff?.status).toBe('modified');
  });

  it('handles API failure by displaying an error message', () => {
    mockAuditApi.list.mockReturnValue(throwError(() => new Error('Network error')));

    const internal = getInternal(component);
    internal.fetchLogs();

    expect(internal.error()).toContain('Không thể tải nhật ký');
    expect(internal.loading()).toBe(false);
  });
});
