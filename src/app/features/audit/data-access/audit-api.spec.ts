import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { AuditLogPage } from '../../../models/audit.models';
import { AuditApi } from './audit-api';

describe('AuditApi', () => {
  let api: AuditApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuditApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('queries audit logs with filters and normalizes envelope structure', () => {
    let result: AuditLogPage | undefined;

    api
      .list({
        page: 2,
        pageSize: 10,
        search: 'admin@uavpms.com',
        actionType: 'Modified',
        tableName: 'Missions',
      })
      .subscribe((res) => (result = res));

    const req = http.expectOne((request) => {
      return (
        request.url === `${environment.apiBaseUrl}/audit-logs` &&
        request.params.get('page') === '2' &&
        request.params.get('pageSize') === '10' &&
        request.params.get('search') === 'admin@uavpms.com' &&
        request.params.get('actionType') === 'Modified' &&
        request.params.get('tableName') === 'Missions'
      );
    });

    req.flush({
      success: true,
      data: {
        items: [
          {
            id: 'log-1',
            userId: 'u1',
            operatorEmail: 'admin@uavpms.com',
            tableName: 'Missions',
            recordId: 'm-123',
            actionType: 'Modified',
            oldValues: '{"status":"Pending"}',
            newValues: '{"status":"InProgress"}',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            createdAt: '2026-09-07T01:15:30.123Z',
          },
        ],
        pagination: {
          page: 2,
          pageSize: 10,
          totalItems: 15,
          totalPages: 2,
        },
      },
    });

    expect(result).toBeDefined();
    expect(result?.items.length).toBe(1);
    expect(result?.items[0].operatorEmail).toBe('admin@uavpms.com');
    expect(result?.items[0].actionType).toBe('Modified');
    expect(result?.items[0].tableName).toBe('Missions');
    expect(result?.pagination.totalItems).toBe(15);
    expect(result?.pagination.totalPages).toBe(2);
  });

  it('returns an empty page when server returns 404', () => {
    let result: AuditLogPage | undefined;

    api
      .list({
        page: 1,
        pageSize: 10,
        search: 'An3439',
      })
      .subscribe((res) => (result = res));

    const req = http.expectOne((r) => r.url === `${environment.apiBaseUrl}/audit-logs`);
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(result).toBeDefined();
    expect(result?.items).toEqual([]);
    expect(result?.pagination.totalItems).toBe(0);
  });
});
