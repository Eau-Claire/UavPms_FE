import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { CreateUserRequest, UserRecord, UserStatus } from '../../../models/users.models';

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient); private readonly url = `${environment.apiBaseUrl}/users`;
  getAll() { return this.http.get<unknown>(this.url).pipe(map((value) => unwrapApiData<readonly UserRecord[]>(value))); }
  create(request: CreateUserRequest) { return this.http.post<unknown>(this.url, request).pipe(map((value) => { const data = unwrapApiData<UserRecord | { user: UserRecord }>(value); return 'user' in data ? data.user : data; })); }
  update(id: string, request: { role?: UserRecord['role']; status?: UserStatus }) { return this.http.patch<unknown>(`${this.url}/${id}`, request).pipe(map((value) => unwrapApiData<UserRecord>(value))); }
  resetPassword(id: string) { return this.http.post<unknown>(`${this.url}/${id}/reset-password`, {}).pipe(map((value) => unwrapApiData<{ username: string; temporaryPassword: string }>(value))); }
  delete(id: string) { return this.http.delete(`${this.url}/${id}`); }
}

