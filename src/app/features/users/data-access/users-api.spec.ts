import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { UsersApi } from './users-api';

describe('UsersApi', () => {
  const url = `${environment.apiBaseUrl}/users`;
  let api: UsersApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(UsersApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('follows /users pagination to load every user', () => {
    let count = 0;
    api.getAll().subscribe((users) => (count = users.length));
    const first = http.expectOne((req) => req.url === url && req.params.get('page') === '1');
    expect(first.request.params.get('pageSize')).toBe('100');
    first.flush({ data: { items: [{ id: 'u1', email: 'a@evn.vn', roles: ['SystemAdmin'] }], pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 2 } } });
    http.expectOne((req) => req.url === url && req.params.get('page') === '2')
      .flush({ data: { items: [{ id: 'u2', email: 'b@evn.vn', roles: ['Inspector'] }], pagination: { page: 2, pageSize: 100, totalItems: 2, totalPages: 2 } } });
    expect(count).toBe(2);
  });

  it('reads geographic scopes', () => {
    let result: unknown;
    api.getGeographicScopes('u1').subscribe((value) => (result = value));
    http.expectOne(`${url}/u1/geographic-scopes`).flush({ success: true, data: {
      userId: 'u1', regions: [{ regionId: 'r1', code: 'HP', name: 'Hải Phòng', type: 'Province' }],
    } });
    expect(result).toEqual({ userId: 'u1', regions: [{ regionId: 'r1', code: 'HP', name: 'Hải Phòng', type: 'Province' }] });
  });

  it('replaces geographic scopes with PUT { regionIds }', () => {
    api.setGeographicScopes('u1', ['r1', 'r2']).subscribe();
    const request = http.expectOne(`${url}/u1/geographic-scopes`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ regionIds: ['r1', 'r2'] });
    request.flush({ data: { userId: 'u1', regions: [] } });
  });
});
