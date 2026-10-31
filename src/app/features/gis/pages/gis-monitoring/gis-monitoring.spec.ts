import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { Auth } from '../../../../core/auth/auth';
import { GisApi, GisDataSnapshot } from '../../data-access/gis-api';
import { MissionTargetSelection } from '../../../missions/data-access/mission-target-selection';
import { GeoJsonPolygon, SelectableAsset } from '../../../../models/assets.models';
import { GisMonitoring, rectangleToPolygon } from './gis-monitoring';

interface GisHarness {
  loadGisData(): void;
  loading(): boolean;
  error(): string;
  towers(): readonly unknown[];
  startDrawing(mode: 'rectangle' | 'polygon'): void;
  startEditing(): void;
  completeEditedGeometry(geometry: GeoJsonPolygon): void;
  clearBoundary(): void;
  redraw(): void;
  onKeydown(event: KeyboardEvent): void;
  resolveGeometry(geometry: GeoJsonPolygon): void;
  toggleSelectionTool(): void;
  closeSelectionPopup(): void;
  drawMode(): string;
  uxState(): string;
  hasBoundary(): boolean;
  showSelectionPopup(): boolean;
  drawingInstruction(): string;
  missionCtaLabel(): string;
  popupTitle(): string;
  spatialAssets(): readonly SelectableAsset[];
  spatialMessage(): string;
  addAllSpatialAssets(): void;
  toggleAsset(asset: SelectableAsset): void;
  canCreateMission(): boolean;
  inspectAsset(asset: SelectableAsset): void;
  selectedEntity(): unknown;
  createMission(): void;
}

describe('GisMonitoring tower selection', () => {
  let fixture: ComponentFixture<GisMonitoring>;
  let api: { spatialQuery: ReturnType<typeof vi.fn>; getAllGisData: ReturnType<typeof vi.fn>; getRegions: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let store: MissionTargetSelection;
  let authMock: { user: WritableSignal<{ id: string; email: string; role: string } | null> };
  const asset: SelectableAsset = { towerId: 'a1', code: 'A-1', name: 'A-1', latitude: 21, longitude: 105 };
  const polygon: GeoJsonPolygon = { type: 'Polygon', coordinates: [[[105, 21], [106, 21], [106, 22], [105, 21]]] };

  it('converts a rectangle to a closed GeoJSON Polygon with [lng, lat] order', () => {
    const result = rectangleToPolygon({ lat: 22, lng: 106 }, { lat: 21, lng: 105 });
    expect(result).toEqual({
      type: 'Polygon', coordinates: [[[105, 21], [106, 21], [106, 22], [105, 22], [105, 21]]],
    });
    // Verify [lng, lat] order: first element is longitude
    const firstCoord = result.coordinates[0][0];
    expect(firstCoord[0]).toBe(105); // longitude first
    expect(firstCoord[1]).toBe(21);  // latitude second
    // Verify polygon closure: first coord === last coord
    expect(result.coordinates[0][0]).toEqual(result.coordinates[0][result.coordinates[0].length - 1]);
  });

  beforeEach(() => {
    api = { spatialQuery: vi.fn().mockReturnValue(of([asset])), getAllGisData: vi.fn(), getRegions: vi.fn().mockReturnValue(of([])) };
    router = { navigate: vi.fn() };
    authMock = { user: signal<{ id: string; email: string; role: string } | null>({ id: 'u1', email: 'manager@evn.vn', role: 'Manager' }) };

    TestBed.configureTestingModule({
      imports: [GisMonitoring],
      providers: [
        { provide: GisApi, useValue: api },
        { provide: Router, useValue: router },
        { provide: Auth, useValue: authMock },
      ],
    });
    fixture = TestBed.createComponent(GisMonitoring);
    store = TestBed.inject(MissionTargetSelection);
    store.clear();
  });

  it('popup is NOT permanently visible', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    expect(component.showSelectionPopup()).toBe(false);
    expect(component.uxState()).toBe('idle');
  });

  it('toggleSelectionTool opens the popup and sets ux to choosing', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    expect(component.showSelectionPopup()).toBe(true);
    expect(component.uxState()).toBe('choosing');
  });

  it('toggleSelectionTool closes the popup when already open', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    expect(component.showSelectionPopup()).toBe(true);
    component.toggleSelectionTool();
    expect(component.showSelectionPopup()).toBe(false);
  });

  it('queries and displays towers for a completed polygon', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    expect(api.spatialQuery).toHaveBeenCalledWith({ geometry: polygon });
    expect(component.spatialAssets()).toEqual([asset]);
    expect(component.popupTitle()).toBe('Cột điện trong vùng (1)');
  });

  it('enters rectangle drawing mode with contextual instructions and Escape cancels it', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.startDrawing('rectangle');
    expect(component.drawMode()).toBe('rectangle');
    expect(component.uxState()).toBe('drawing-rectangle');
    expect(component.drawingInstruction()).toContain('Nhấn và kéo');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.drawMode()).toBe('none');
    expect(component.uxState()).toBe('choosing');
  });

  it('enters polygon drawing mode with multi-line instructions', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.startDrawing('polygon');
    expect(component.drawMode()).toBe('polygon');
    expect(component.uxState()).toBe('drawing-polygon');
    expect(component.drawingInstruction()).toContain('Nhấp để đặt từng điểm');
    expect(component.drawingInstruction()).toContain('Nhấp điểm đầu để hoàn tất');
  });

  it('completing polygon drawing exits drawing mode and keeps the geometry', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.startDrawing('polygon');
    component.resolveGeometry(polygon);
    expect(component.drawMode()).toBe('none');
    expect(component.hasBoundary()).toBe(true);
    expect(api.spatialQuery).toHaveBeenCalledOnce();
  });

  it('activates edit mode and reruns the query when editing completes', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    component.startEditing();
    expect(component.uxState()).toBe('editing');
    component.completeEditedGeometry({ type: 'Polygon', coordinates: [[[105, 21], [107, 21], [107, 22], [105, 21]]] });
    expect(api.spatialQuery).toHaveBeenCalledTimes(2);
    expect(component.uxState()).toBe('success');
  });

  it('adds without duplicates and supports deselection', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    component.addAllSpatialAssets();
    component.addAllSpatialAssets();
    expect(store.count()).toBe(1);
    component.toggleAsset(asset);
    expect(store.count()).toBe(0);
  });

  it('deduplicates candidates returned by the API', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    api.spatialQuery.mockReturnValueOnce(of([asset, asset]));
    component.resolveGeometry(polygon);
    expect(component.spatialAssets()).toEqual([asset]);
  });

  it('inspectAsset opens the tower drawer', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    expect(component.selectedEntity()).toBeNull();
    component.inspectAsset(asset);
    const selected = component.selectedEntity() as { type: string; data: { towerCode: string } };
    expect(selected).not.toBeNull();
    expect(selected.type).toBe('tower');
    expect(selected.data.towerCode).toBe('A-1');
  });

  it('CREATE_MISSION permission check allows Admin and Manager', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    authMock.user.set({ id: 'u1', email: 'admin@evn.vn', role: 'Admin' });
    expect(component.canCreateMission()).toBe(true);

    authMock.user.set({ id: 'u2', email: 'manager@evn.vn', role: 'Manager' });
    expect(component.canCreateMission()).toBe(true);
  });

  it('CREATE_MISSION permission check disallows Inspector, Analyst, Technician, Viewer', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    authMock.user.set({ id: 'u3', email: 'inspector@evn.vn', role: 'Inspector' });
    expect(component.canCreateMission()).toBe(false);

    authMock.user.set({ id: 'u4', email: 'analyst@evn.vn', role: 'Analyst' });
    expect(component.canCreateMission()).toBe(false);

    authMock.user.set({ id: 'u5', email: 'tech@evn.vn', role: 'Technician' });
    expect(component.canCreateMission()).toBe(false);

    authMock.user.set({ id: 'u6', email: 'viewer@evn.vn', role: 'Viewer' });
    expect(component.canCreateMission()).toBe(false);
  });

  it('createMission opens a pre-mission assessment when towers are selected', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    component.addAllSpatialAssets();
    expect(store.count()).toBe(1);
    component.createMission();
    expect(router.navigate).toHaveBeenCalledWith(['/pre-mission/new']);
    // Target asset IDs remain stored in targetSelection
    expect(store.selected()[0].towerId).toBe('a1');
  });

  it('clears region candidates without removing confirmed mission targets', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.resolveGeometry(polygon);
    component.addAllSpatialAssets();
    component.clearBoundary();
    expect(component.spatialAssets()).toEqual([]);
    expect(component.hasBoundary()).toBe(false);
    expect(store.count()).toBe(1);
  });

  it('redraw clears candidates and geometry but preserves confirmed targets', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.resolveGeometry(polygon);
    component.addAllSpatialAssets();
    component.redraw();
    expect(component.spatialAssets()).toEqual([]);
    expect(component.hasBoundary()).toBe(false);
    expect(component.uxState()).toBe('choosing');
    expect(store.count()).toBe(1);
  });

  it('reflects the selected count in the mission CTA', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    expect(component.missionCtaLabel()).toBe('Lập đánh giá tiền bay');
    store.add({ towerId: asset.towerId, towerCode: asset.code, latitude: asset.latitude, longitude: asset.longitude });
    expect(component.missionCtaLabel()).toBe('Lập đánh giá tiền bay (1)');
  });

  it('handles empty results as a distinct state from API errors', () => {
    const component = fixture.componentInstance as unknown as GisHarness;

    // Empty result (0 assets)
    api.spatialQuery.mockReturnValueOnce(of([]));
    component.resolveGeometry(polygon);
    expect(component.spatialMessage()).toContain('Không có cột điện');
    expect(component.uxState()).toBe('empty');

    // API error
    api.spatialQuery.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    component.resolveGeometry(polygon);
    expect(component.spatialMessage()).toContain('Không thể truy vấn cột điện trong vùng');
    expect(component.uxState()).toBe('error');
  });

  it('preserves geometry after API error', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    api.spatialQuery.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    component.resolveGeometry(polygon);
    expect(component.uxState()).toBe('error');
    expect(component.hasBoundary()).toBe(true);
    expect(component.spatialMessage()).toContain('Không thể truy vấn cột điện trong vùng');
  });

  it('closeSelectionPopup during drawing cancels unfinished geometry', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.startDrawing('rectangle');
    expect(component.drawMode()).toBe('rectangle');
    component.closeSelectionPopup();
    expect(component.showSelectionPopup()).toBe(false);
    expect(component.drawMode()).toBe('none');
  });

  it('closeSelectionPopup with existing geometry just closes popup', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.resolveGeometry(polygon);
    expect(component.hasBoundary()).toBe(true);
    component.closeSelectionPopup();
    expect(component.showSelectionPopup()).toBe(false);
    expect(component.hasBoundary()).toBe(true);
  });

  it('toggleSelectionTool reopens popup for existing region', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    component.toggleSelectionTool();
    component.resolveGeometry(polygon);
    expect(component.uxState()).toBe('success');
    component.closeSelectionPopup();
    component.toggleSelectionTool();
    expect(component.showSelectionPopup()).toBe(true);
    expect(component.uxState()).toBe('success');
  });

  it('spatial query sends valid GeoJSON with [lng, lat] coordinate order', () => {
    const component = fixture.componentInstance as unknown as GisHarness;
    const geo: GeoJsonPolygon = { type: 'Polygon', coordinates: [[[105.5, 21.0], [106.0, 21.0], [106.0, 21.5], [105.5, 21.5], [105.5, 21.0]]] };
    component.resolveGeometry(geo);
    const call = api.spatialQuery.mock.calls[0][0] as { geometry: GeoJsonPolygon };
    expect(call.geometry.coordinates[0][0][0]).toBe(105.5);
    expect(call.geometry.coordinates[0][0][1]).toBe(21.0);
    const ring = call.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('supports polygons with arbitrary number of vertices (> 3 points) and closes properly', () => {
    const component = fixture.componentInstance as unknown as GisHarness & {
      polygonVertices: { set(v: { lat: number; lng: number }[]): void; (): { lat: number; lng: number }[] };
      completePolygon(): void;
    };
    component.startDrawing('polygon');
    const fivePoints = [
      { lat: 21.0, lng: 105.0 },
      { lat: 21.0, lng: 106.0 },
      { lat: 21.5, lng: 106.5 },
      { lat: 22.0, lng: 106.0 },
      { lat: 21.8, lng: 105.2 },
    ];
    component.polygonVertices.set(fivePoints as unknown as L.LatLng[]);
    expect(component.polygonVertices().length).toBe(5);

    component.completePolygon();
    expect(api.spatialQuery).toHaveBeenCalledOnce();
    const call = api.spatialQuery.mock.calls[0][0] as { geometry: GeoJsonPolygon };
    expect(call.geometry.coordinates[0].length).toBe(6);
    expect(call.geometry.coordinates[0][0]).toEqual([105.0, 21.0]);
    expect(call.geometry.coordinates[0][5]).toEqual([105.0, 21.0]);
  });

  it('keeps GIS empty while loading and distinguishes successful empty data', () => {
    const pending = new Subject<GisDataSnapshot>();
    api.getAllGisData.mockReturnValue(pending);
    const component = fixture.componentInstance as unknown as GisHarness;
    component.loadGisData();
    expect(component.loading()).toBe(true);
    expect(component.towers()).toEqual([]);
    pending.next({ towers: [], anomalies: [], alerts: [] });
    pending.complete();
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('');
    expect(component.towers()).toEqual([]);
  });

  it.each([403, 500])('shows a distinct GIS failure for status %s without markers', (status) => {
    api.getAllGisData.mockReturnValue(throwError(() => ({ status })));
    const component = fixture.componentInstance as unknown as GisHarness;
    component.loadGisData();
    expect(component.loading()).toBe(false);
    expect(component.towers()).toEqual([]);
    expect(component.error()).toContain(status === 403 ? '403' : 'Không thể tải');
  });

  it('reloads GIS data for the selected region and scopes the spatial query to it', () => {
    api.getAllGisData.mockReturnValue(of({ towers: [], anomalies: [], alerts: [] }));
    const component = fixture.componentInstance as unknown as GisHarness & { changeRegion(id: string): void };
    component.changeRegion('r1');
    expect(api.getAllGisData).toHaveBeenLastCalledWith({ administrativeAreaId: 'r1' });
    component.resolveGeometry(polygon);
    expect(api.spatialQuery).toHaveBeenLastCalledWith({ geometry: polygon, filters: { regionId: 'r1' } });
  });
});
