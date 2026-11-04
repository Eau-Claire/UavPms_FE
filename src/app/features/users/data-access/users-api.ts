import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, reduce } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { CreateUserRequest, UserGeographicScopes, UserRecord, UserStatus } from '../../../models/users.models';
import { UserRole } from '../../../models/auth.models';

const MAX_PAGE_SIZE = 100;

function normalizeScopes(value: unknown, userId: string): UserGeographicScopes {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const regions = Array.isArray(source['regions']) ? source['regions'] : [];
  return {
    userId: String(source['userId'] ?? userId),
    regions: regions
      .map((item) => {
        const region = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          regionId: String(region['regionId'] ?? region['id'] ?? ''),
          code: String(region['code'] ?? ''),
          name: String(region['name'] ?? region['regionName'] ?? ''),
          type: String(region['type'] ?? ''),
        };
      })
      .filter((region) => region.regionId),
  };
}

function normalizeRole(rawRole?: string): UserRole {
  if (!rawRole) return 'Viewer';
  if (rawRole === 'SystemAdmin') return 'Admin';
  return rawRole as UserRole;
}

function mapBackendUser(raw: unknown): UserRecord {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let role: UserRole = 'Viewer';
  if (Array.isArray(item['roles']) && item['roles'].length > 0) {
    role = normalizeRole(String(item['roles'][0]));
  } else if (item['role']) {
    role = normalizeRole(String(item['role']));
  }

  return {
    id: String(item['id'] ?? ''),
    username: String(item['username'] ?? item['email'] ?? ''),
    fullName: String(item['fullName'] ?? ''),
    email: String(item['email'] ?? ''),
    phone: String(item['phone'] ?? ''),
    role,
    status: (item['status'] ?? 'Active') as UserStatus,
    createdAt: item['createdAt'] ? String(item['createdAt']) : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/users`;

  /** Every user (GET /users is paged, max 100 per page; SystemAdmin only). */
  getAll(): Observable<readonly UserRecord[]> {
    const page = (number: number) =>
      this.http.get<unknown>(this.url, { params: { page: number, pageSize: MAX_PAGE_SIZE } }).pipe(
        map((value) => {
          const data = unwrapApiData<Record<string, unknown>>(value);
          const list = Array.isArray(data)
            ? data
            : Array.isArray(data?.['items'])
              ? (data['items'] as unknown[])
              : [];
          const pagination =
            data?.['pagination'] && typeof data['pagination'] === 'object'
              ? (data['pagination'] as Record<string, unknown>)
              : {};
          const totalPages = Number(pagination['totalPages'] ?? 1) || 1;
          return { page: number, totalPages, items: list.map(mapBackendUser) };
        }),
      );
    return page(1).pipe(
      expand((result) => (result.page < result.totalPages ? page(result.page + 1) : EMPTY)),
      reduce((all, result) => [...all, ...result.items], [] as UserRecord[]),
    );
  }

  getById(id: string): Observable<UserRecord> {
    return this.http.get<unknown>(`${this.url}/${id}`).pipe(
      map((value) => mapBackendUser(unwrapApiData(value))),
    );
  }

  /** GET /users/{id}/geographic-scopes (OperationsService). SystemAdmin/Manager may read anyone's scope. */
  getGeographicScopes(userId: string): Observable<UserGeographicScopes> {
    return this.http.get<unknown>(`${this.url}/${userId}/geographic-scopes`).pipe(
      map((value) => normalizeScopes(unwrapApiData(value), userId)),
    );
  }

  /** PUT /users/{id}/geographic-scopes — replaces the whole scope (empty list removes all). SystemAdmin/Manager only. */
  setGeographicScopes(userId: string, regionIds: readonly string[]): Observable<UserGeographicScopes> {
    return this.http.put<unknown>(`${this.url}/${userId}/geographic-scopes`, { regionIds }).pipe(
      map((value) => normalizeScopes(unwrapApiData(value), userId)),
    );
  }

  getAssignable(): Observable<readonly UserRecord[]> {
    return this.http.get<unknown>(`${this.url}/assignable`).pipe(
      map((value) => {
        const data = unwrapApiData<Record<string, unknown>>(value);
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.['items'])
            ? (data['items'] as unknown[])
            : [];
        return list.map((raw) => {
          const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
          return {
            id: String(item['id'] ?? ''),
            username: String(item['username'] ?? item['email'] ?? ''),
            fullName: String(item['fullName'] ?? ''),
            email: String(item['email'] ?? ''),
            phone: String(item['phone'] ?? ''),
            role: 'Inspector' as UserRole,
            status: 'Active' as UserStatus,
          };
        });
      }),
    );
  }

  create(request: CreateUserRequest): Observable<UserRecord> {
    const roleValue = request.role === 'Admin' ? 'SystemAdmin' : request.role;
    const payload = {
      fullName: request.fullName,
      email: request.email,
      phone: request.phone || '',
      password: 'Pms@2026!',
      role: roleValue,
      roles: [roleValue],
    };
    return this.http.post<unknown>(this.url, payload).pipe(
      map((value) => {
        const data = unwrapApiData<Record<string, unknown>>(value);
        const user = data && typeof data === 'object' && 'user' in data ? data['user'] : data;
        return mapBackendUser(user);
      }),
    );
  }

  update(id: string, request: { role?: UserRecord['role']; status?: UserStatus; fullName?: string; phone?: string }): Observable<UserRecord> {
    const payload: Record<string, unknown> = { ...request };
    if (request.role) {
      const roleValue = request.role === 'Admin' ? 'SystemAdmin' : request.role;
      payload['role'] = roleValue;
      payload['roles'] = [roleValue];
    }
    return this.http.patch<unknown>(`${this.url}/${id}`, payload).pipe(
      map((value) => {
        const data = unwrapApiData(value);
        return mapBackendUser(data);
      }),
    );
  }

  suspend(id: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.url}/${id}/suspend`, {});
  }

  resetPassword(id: string): Observable<{ username: string; temporaryPassword: string }> {
    return this.http.post<unknown>(`${this.url}/${id}/reset-password`, {}).pipe(
      map((value) => unwrapApiData<{ username: string; temporaryPassword: string }>(value)),
    );
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/${id}`);
  }
}
