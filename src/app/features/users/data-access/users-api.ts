import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { CreateUserRequest, UserRecord, UserStatus } from '../../../models/users.models';
import { UserRole } from '../../../models/auth.models';

function normalizeRole(rawRole?: string): UserRole {
  if (!rawRole) return 'Viewer';
  if (rawRole === 'SystemAdmin') return 'Admin';
  return rawRole as UserRole;
}

function mapBackendUser(item: any): UserRecord {
  let role: UserRole = 'Viewer';
  if (Array.isArray(item?.roles) && item.roles.length > 0) {
    role = normalizeRole(item.roles[0]);
  } else if (item?.role) {
    role = normalizeRole(item.role);
  }

  return {
    id: String(item?.id ?? ''),
    username: item?.username ?? item?.email ?? '',
    fullName: item?.fullName ?? '',
    email: item?.email ?? '',
    phone: item?.phone ?? '',
    role,
    status: (item?.status ?? 'Active') as UserStatus,
    createdAt: item?.createdAt ? String(item.createdAt) : undefined,
  };
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/users`;

  getAll() {
    return this.http.get<unknown>(this.url).pipe(
      map((value) => {
        const data = unwrapApiData<any>(value);
        const list = Array.isArray(data)
          ? data
          : data?.items && Array.isArray(data.items)
            ? data.items
            : [];
        return list.map(mapBackendUser) as readonly UserRecord[];
      })
    );
  }

  getAssignable() {
    return this.http.get<unknown>(`${this.url}/assignable`).pipe(
      map((value) => {
        const data = unwrapApiData<any>(value);
        const list = Array.isArray(data)
          ? data
          : data?.items && Array.isArray(data.items)
            ? data.items
            : [];
        return list.map((item: any) => ({
          id: String(item?.id ?? ''),
          username: item?.username ?? item?.email ?? '',
          fullName: item?.fullName ?? '',
          email: item?.email ?? '',
          phone: item?.phone ?? '',
          role: 'Inspector' as UserRole,
          status: 'Active' as UserStatus,
        })) as readonly UserRecord[];
      })
    );
  }

  create(request: CreateUserRequest) {
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
        const data = unwrapApiData<any>(value);
        const user = data && typeof data === 'object' && 'user' in data ? data.user : data;
        return mapBackendUser(user);
      })
    );
  }

  update(id: string, request: { role?: UserRecord['role']; status?: UserStatus; fullName?: string; phone?: string }) {
    const payload: any = { ...request };
    if (request.role) {
      const roleValue = request.role === 'Admin' ? 'SystemAdmin' : request.role;
      payload.role = roleValue;
      payload.roles = [roleValue];
    }
    return this.http.patch<unknown>(`${this.url}/${id}`, payload).pipe(
      map((value) => {
        const data = unwrapApiData<any>(value);
        return mapBackendUser(data);
      })
    );
  }

  resetPassword(id: string) {
    return this.http.post<unknown>(`${this.url}/${id}/reset-password`, {}).pipe(
      map((value) => unwrapApiData<{ username: string; temporaryPassword: string }>(value))
    );
  }

  delete(id: string) {
    return this.http.delete(`${this.url}/${id}`);
  }
}
