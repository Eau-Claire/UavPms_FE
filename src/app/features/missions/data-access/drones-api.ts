import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { unwrapApiData } from '../../../models/api.models';
import { DroneDto } from '../../../models/drones.models';

@Injectable({ providedIn: 'root' })
export class DronesApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/drones`;

  getAll(): Observable<readonly DroneDto[]> {
    return this.http.get<unknown>(this.url).pipe(
      map((res) => normalizeDroneList(unwrapApiData(res))),
      catchError(() => of([])),
    );
  }

  getAvailableDrones(): Observable<readonly DroneDto[]> {
    return this.http.get<unknown>(`${this.url}/available`).pipe(
      map((res) => normalizeDroneList(unwrapApiData(res))),
      catchError(() => {
        return this.getAll().pipe(
          map((drones) => drones.filter((d) => d.online && (d.operationalStatus === 'Idle' || d.operationalStatus === 'Available'))),
        );
      }),
    );
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const pick = (source: Record<string, unknown>, ...keys: string[]) =>
  keys.map((key) => source[key]).find((value) => value !== undefined && value !== null);

const stringValue = (value: unknown, fallback = '') =>
  value === undefined || value === null ? fallback : String(value);

const numberValue = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const booleanValue = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
};

const normalizeDrone = (item: unknown): DroneDto => {
  const source = record(item);
  return {
    id: stringValue(pick(source, 'id', 'droneId')),
    droneCode: stringValue(pick(source, 'droneCode', 'code'), 'UAV-UNKNOWN'),
    name: stringValue(pick(source, 'name', 'model', 'deviceName'), 'UAV'),
    online: booleanValue(pick(source, 'online', 'isOnline'), true),
    battery: numberValue(pick(source, 'battery', 'batteryLevel', 'batteryPercentage'), 100),
    operationalStatus: stringValue(pick(source, 'operationalStatus', 'status'), 'Idle'),
    lastSeenAt: stringValue(pick(source, 'lastSeenAt', 'updatedAt')),
    latitude: numberValue(pick(source, 'latitude', 'lat')),
    longitude: numberValue(pick(source, 'longitude', 'lng', 'lon')),
    altitude: numberValue(pick(source, 'altitude', 'alt')),
  };
};

const normalizeDroneList = (value: unknown): readonly DroneDto[] => {
  if (Array.isArray(value)) return value.map(normalizeDrone);
  const source = record(value);
  const items = pick(source, 'items', 'drones', 'records', 'data');
  return Array.isArray(items) ? items.map(normalizeDrone) : [];
};
