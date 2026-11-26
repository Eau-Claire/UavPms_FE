import type { Feature, FeatureCollection, LineString } from 'geojson';
import {
  addProtocol,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type RequestParameters,
  type StyleSpecification,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';

export type LocalMapMode = 'pmtiles' | 'schematic';
export interface LocalGisCoordinate { latitude: number; longitude: number; }
export interface LocalGisMapOptions {
  mode?: LocalMapMode;
  center?: readonly [number, number];
  zoom?: number;
  scrollZoom?: boolean;
  showZoomControl?: boolean;
  onFallbackToSchematic?: () => void;
}

export const LOCAL_PMTILES_PATH = '/maps/evnspc-south-z12.pmtiles';
export const LOCAL_PMTILES_URL = `pmtiles://${LOCAL_PMTILES_PATH}`;
export const LOCAL_GLYPHS_URL = '/maps/fonts/{fontstack}/{range}.pbf';
/** Vùng phủ thực tế của public/maps/evnspc-south-z12.pmtiles (Nam Bộ). */
export const EVNSPC_COVERAGE_BOUNDS = { minLat: 8.0, maxLat: 16.2, minLng: 102.0, maxLng: 109.6 } as const;
export const DEFAULT_LOCAL_MAP_CENTER: readonly [number, number] = [106.7009, 10.7769];
export const DEFAULT_LOCAL_MAP_ZOOM = 12;

const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LNG = -180;
const MAX_LNG = 180;
const PMTILES_SCHEME = 'pmtiles://';
const DEFAULT_ROUTE_ID = 'uav-local-route';
const SCHEMATIC_GRID_BOUNDS = { minLat: 6, maxLat: 24, minLng: 100, maxLng: 112, stepDeg: 1 } as const;
const DEFAULT_FIT_PADDING_PX = 36;
const DEFAULT_FIT_MAX_ZOOM = 16;
const SINGLE_POINT_MAX_ZOOM = 15;

let pmtilesProtocolRegistered = false;
const registeredCustomProtocols = new WeakSet<typeof addProtocol>();

/** Kiểm tra tọa độ WGS84 hợp lệ trước khi vẽ marker/tuyến. */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return latitude >= MIN_LAT && latitude <= MAX_LAT && longitude >= MIN_LNG && longitude <= MAX_LNG;
}

/** Lọc bỏ an toàn bản ghi tọa độ hỏng để không làm mất dữ liệu hợp lệ. */
export function filterValidCoordinates<T>(
  items: readonly T[],
  readCoords: (item: T) => { latitude: unknown; longitude: unknown },
): T[] {
  const valid: T[] = [];
  for (const item of items) {
    const { latitude, longitude } = readCoords(item);
    if (isValidCoordinate(latitude, longitude)) valid.push(item);
  }
  return valid;
}

export function isWithinEvnspcCoverage(latitude: number, longitude: number): boolean {
  if (!isValidCoordinate(latitude, longitude)) return false;
  const { minLat, maxLat, minLng, maxLng } = EVNSPC_COVERAGE_BOUNDS;
  return latitude >= minLat && latitude <= maxLat && longitude >= minLng && longitude <= maxLng;
}

/** Ngoài vùng phủ PMTiles nội bộ sẽ tự chuyển sang schematic local, không gọi tile online. */
export function resolveLocalMapMode(points: readonly LocalGisCoordinate[], preferredMode: LocalMapMode = 'pmtiles'): LocalMapMode {
  if (preferredMode === 'schematic') return 'schematic';
  return points.some((p) => !isWithinEvnspcCoverage(p.latitude, p.longitude)) ? 'schematic' : 'pmtiles';
}

/** Đăng ký protocol `pmtiles` đúng một lần để mở/đóng nhiều bản đồ liên tiếp không lỗi. */
export function ensurePmtilesProtocolRegistered(registerFn: typeof addProtocol = addProtocol): boolean {
  if (registerFn === addProtocol) {
    if (pmtilesProtocolRegistered) return false;
    registerFn('pmtiles', new Protocol().tile);
    pmtilesProtocolRegistered = true;
    return true;
  }

  // Test truyền mock riêng không khóa cờ module toàn cục của addProtocol mặc định.
  if (registeredCustomProtocols.has(registerFn)) return false;
  registerFn('pmtiles', new Protocol().tile);
  registeredCustomProtocols.add(registerFn);
  return true;
}

/** Chỉ cho phép nguồn nội bộ; chặn tuyệt đối URL bản đồ/tile/glyph bên thứ ba ở runtime. */
export function isLocalOnlyMapUrl(url: string, currentOrigin?: string): boolean {
  const trimmed = url.trim();
  // Chặn chuỗi rỗng và dấu '\' để tránh bypass kiểu '/\evil.com' hoặc 'pmtiles:///\evil.com'.
  if (!trimmed || trimmed.includes('\\')) return false;

  // Chỉ cho phép data: trực tiếp, không cho lồng sau pmtiles://.
  if (trimmed.startsWith('data:')) return true;

  const target = trimmed.startsWith(PMTILES_SCHEME) ? trimmed.slice(PMTILES_SCHEME.length) : trimmed;
  if (!target || target.includes('\\')) return false;

  if (target.startsWith('blob:')) {
    if (!currentOrigin) return false;
    try {
      return new URL(target).origin === currentOrigin;
    } catch {
      return false;
    }
  }

  if (!currentOrigin) {
    return target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\');
  }

  try {
    return new URL(target, currentOrigin).origin === currentOrigin;
  } catch {
    return false;
  }
}

export function transformLocalMapRequest(url: string, currentOrigin?: string): RequestParameters {
  const trimmed = url.trim();
  if (!isLocalOnlyMapUrl(trimmed, currentOrigin)) {
    throw new Error('Blocked external GIS request under local-only policy.');
  }
  // Web Worker của MapLibre cần URL cùng origin để tải font glyph nội bộ từ /maps/fonts.
  if (trimmed.startsWith('/') && currentOrigin) {
    return { url: new URL(trimmed, currentOrigin).href };
  }
  return { url: trimmed };
}

function buildSchematicGridGeoJson(): FeatureCollection<LineString> {
  const { minLat, maxLat, minLng, maxLng, stepDeg } = SCHEMATIC_GRID_BOUNDS;
  const features: Feature<LineString>[] = [];
  for (let lng = minLng; lng <= maxLng; lng += stepDeg) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lng, minLat], [lng, maxLat]] } });
  }
  for (let lat = minLat; lat <= maxLat; lat += stepDeg) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[minLng, lat], [maxLng, lat]] } });
  }
  return { type: 'FeatureCollection', features };
}

/** Nền sơ đồ lưới nội bộ 100% offline khi ngoài vùng phủ PMTiles hoặc tải PMTiles lỗi. */
export function buildLocalSchematicStyle(): StyleSpecification {
  return {
    version: 8,
    sources: { 'schematic-grid': { type: 'geojson', data: buildSchematicGridGeoJson() } },
    layers: [
      { id: 'schematic-background', type: 'background', paint: { 'background-color': '#f1f5f9' } },
      { id: 'schematic-grid-lines', type: 'line', source: 'schematic-grid', paint: { 'line-color': '#cbd5e1', 'line-width': 1, 'line-dasharray': [4, 4] } },
    ],
  };
}

/** Style bản đồ vector nội bộ đọc từ public/maps/evnspc-south-z12.pmtiles. */
export function buildLocalBasemapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: LOCAL_GLYPHS_URL,
    sources: {
      basemap: { type: 'vector', url: LOCAL_PMTILES_URL, attribution: 'EVNSPC Local Vector Basemap (PMTiles) | UAV-PMS GIS' },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#edf2f7' } },
      { id: 'earth', type: 'fill', source: 'basemap', 'source-layer': 'earth', paint: { 'fill-color': '#f7f5ef' } },
      { id: 'landuse', type: 'fill', source: 'basemap', 'source-layer': 'landuse', paint: { 'fill-color': '#e8f2e4', 'fill-opacity': 0.72 } },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#b8dff2' } },
      { id: 'boundaries', type: 'line', source: 'basemap', 'source-layer': 'boundaries', paint: { 'line-color': '#9aa9bb', 'line-width': 1 } },
      { id: 'roads', type: 'line', source: 'basemap', 'source-layer': 'roads', paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 2.2] } },
      {
        id: 'place-labels', type: 'symbol', source: 'basemap', 'source-layer': 'places', minzoom: 4,
        layout: { 'text-field': ['coalesce', ['get', 'name:vi'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 10, 15], 'text-allow-overlap': false },
        paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: 'road-labels', type: 'symbol', source: 'basemap', 'source-layer': 'roads', minzoom: 10,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:vi'], ['get', 'name'], ['get', 'ref']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': '#64748b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.25 },
      },
    ],
  };
}

export function buildLocalGisStyle(mode: LocalMapMode): StyleSpecification {
  return mode === 'schematic' ? buildLocalSchematicStyle() : buildLocalBasemapStyle();
}

/** Tự động hạ cấp sang schematic local đúng một lần khi PMTiles gặp lỗi tải. */
export function attachLocalPmtilesFallback(
  map: Pick<MapLibreMap, 'on' | 'setStyle'>,
  initialMode: LocalMapMode,
  onFallback?: () => void,
): void {
  if (initialMode !== 'pmtiles') return;
  let hasFallenBack = false;
  map.on('error', (event?: { error?: { name?: string } }) => {
    // Bỏ qua AbortError khi người dùng pan/zoom nhanh để tránh tụt nhầm sang schematic.
    if (event?.error?.name === 'AbortError') return;
    if (hasFallenBack) return;
    hasFallenBack = true;
    map.setStyle(buildLocalSchematicStyle());
    onFallback?.();
  });
}

export function createLocalGisMap(container: HTMLElement, options: LocalGisMapOptions = {}): MapLibreMap | null {
  ensurePmtilesProtocolRegistered();
  const mode = options.mode ?? 'pmtiles';
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
    ? window.location.origin : undefined;

  try {
    const map = new MapLibreMap({
      container,
      style: buildLocalGisStyle(mode),
      center: [...(options.center ?? DEFAULT_LOCAL_MAP_CENTER)],
      zoom: options.zoom ?? DEFAULT_LOCAL_MAP_ZOOM,
      scrollZoom: options.scrollZoom ?? true,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      attributionControl: false,
      transformRequest: (url) => transformLocalMapRequest(url, currentOrigin),
    });
    if (options.showZoomControl !== false) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    attachLocalPmtilesFallback(map, mode, options.onFallbackToSchematic);
    return map;
  } catch {
    // Môi trường không có WebGL (ví dụ jsdom test): hạ cấp an toàn sang schematic cục bộ.
    container.dataset['gisFallback'] = 'schematic';
    options.onFallbackToSchematic?.();
    return null;
  }
}

export function setLocalGisRouteLine(
  map: MapLibreMap,
  coordinates: readonly [number, number][],
  options: { sourceId?: string; color?: string; width?: number } = {},
): void {
  const id = options.sourceId ?? DEFAULT_ROUTE_ID;
  const features: Feature<LineString>[] = coordinates.length > 1
    ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...coordinates] } }] : [];
  const data: FeatureCollection<LineString> = { type: 'FeatureCollection', features };
  const applyRoute = () => {
    const existing = map.getSource<GeoJSONSource>(id);
    if (existing) {
      existing.setData(data);
      return;
    }
    map.addSource(id, { type: 'geojson', data });
    map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': options.color ?? '#1d4f91', 'line-width': options.width ?? 3, 'line-opacity': 0.9, 'line-dasharray': [2, 2] } });
  };
  if (map.isStyleLoaded()) applyRoute();
  else map.once('style.load', applyRoute);
}

export function fitLocalGisBounds(
  map: MapLibreMap,
  coordinates: readonly [number, number][],
  padding = DEFAULT_FIT_PADDING_PX,
  maxZoom = DEFAULT_FIT_MAX_ZOOM,
): void {
  if (coordinates.length === 0) {
    map.jumpTo({ center: [...DEFAULT_LOCAL_MAP_CENTER], zoom: DEFAULT_LOCAL_MAP_ZOOM });
    return;
  }
  if (coordinates.length === 1) {
    map.jumpTo({ center: coordinates[0], zoom: Math.min(maxZoom, SINGLE_POINT_MAX_ZOOM) });
    return;
  }
  const bounds = new LngLatBounds(coordinates[0], coordinates[0]);
  for (const point of coordinates) bounds.extend(point);
  map.fitBounds(bounds, { padding, maxZoom, duration: 0 });
}
