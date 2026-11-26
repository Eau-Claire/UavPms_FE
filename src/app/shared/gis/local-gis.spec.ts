import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import {
  attachLocalPmtilesFallback, buildLocalBasemapStyle, buildLocalGisStyle, buildLocalSchematicStyle,
  createLocalGisMap, ensurePmtilesProtocolRegistered, filterValidCoordinates, isLocalOnlyMapUrl,
  isValidCoordinate, isWithinEvnspcCoverage, LOCAL_GLYPHS_URL, LOCAL_PMTILES_URL,
  resolveLocalMapMode, transformLocalMapRequest,
} from './local-gis';

const EXTERNAL_HTTP_PATTERN = /https?:\/\//i;
const FORBIDDEN_PROVIDER_PATTERN =
  /openstreetmap|cartocdn|arcgisonline|arcgis|googleapis|google\.com|mapbox|stadiamaps|demotiles|esrigis|protomaps\.com/i;

function assertZeroExternalUrls(style: StyleSpecification): void {
  const serialized = JSON.stringify(style);
  expect(serialized).not.toMatch(EXTERNAL_HTTP_PATTERN);
  expect(serialized).not.toMatch(FORBIDDEN_PROVIDER_PATTERN);
  expect(style.sprite).toBeUndefined();
}

describe('local-gis (FE-REQ-004a)', () => {
  it('registers pmtiles protocol idempotently without locking global flag via custom mocks', () => {
    const firstMock = vi.fn();
    expect(ensurePmtilesProtocolRegistered(firstMock)).toBe(true);
    expect(ensurePmtilesProtocolRegistered(firstMock)).toBe(false);
    expect(firstMock).toHaveBeenCalledTimes(1);
    expect(firstMock).toHaveBeenCalledWith('pmtiles', expect.any(Function));

    // Mock mới không bị khóa bởi lần gọi mock trước đó.
    const secondMock = vi.fn();
    expect(ensurePmtilesProtocolRegistered(secondMock)).toBe(true);
    expect(secondMock).toHaveBeenCalledTimes(1);
  });

  it('allows local paths, same-origin URLs, direct data:, same-origin blob: and blocks external/bypass URLs', () => {
    const origin = 'http://localhost:5173';
    expect(transformLocalMapRequest('/maps/fonts/Noto/0-255.pbf', origin)).toEqual({
      url: 'http://localhost:5173/maps/fonts/Noto/0-255.pbf',
    });

    const allowedUrls = [
      LOCAL_PMTILES_URL,
      'http://localhost:5173/maps/evnspc-south-z12.pmtiles',
      'http://localhost:5173/maps/fonts/Noto%20Sans%20Regular/0-255.pbf',
      'pmtiles://http://localhost:5173/maps/evnspc-south-z12.pmtiles',
      'data:application/octet-stream;base64,',
      'blob:http://localhost:5173/test-id',
    ];
    for (const allowedUrl of allowedUrls) {
      expect(isLocalOnlyMapUrl(allowedUrl, origin)).toBe(true);
      expect(transformLocalMapRequest(allowedUrl, origin)).toEqual({ url: allowedUrl });
    }

    const blockedUrls = [
      '',
      '   ',
      'https://tile.openstreetmap.org/10/1/1.png',
      'https://mt0.google.com/vt/lyrs=m&x=1&y=1&z=10',
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/1/1/1',
      'pmtiles://https://build.protomaps.com/20260909.pmtiles',
      'pmtiles://data:application/octet-stream;base64,',
      '//basemaps.cartocdn.com/light_all/1/1/1.png',
      'http://127.0.0.1:5173/maps/a.pmtiles',
      '/\\evil.com/tile.png',
      'pmtiles:///\\evil.com/a.pmtiles',
      'blob:https://evil.com/test-id',
    ];
    for (const externalUrl of blockedUrls) {
      expect(isLocalOnlyMapUrl(externalUrl, origin)).toBe(false);
      expect(() => transformLocalMapRequest(externalUrl, origin)).toThrow(/local-only/i);
    }

    // Khi không có currentOrigin: chỉ chấp nhận đường dẫn tương đối nội bộ hoặc data: trực tiếp.
    expect(isLocalOnlyMapUrl(LOCAL_PMTILES_URL)).toBe(true);
    expect(isLocalOnlyMapUrl('/maps/evnspc-south-z12.pmtiles')).toBe(true);
    expect(isLocalOnlyMapUrl('data:application/octet-stream;base64,')).toBe(true);
    expect(isLocalOnlyMapUrl('http://localhost:5173/maps/evnspc-south-z12.pmtiles')).toBe(false);
    expect(isLocalOnlyMapUrl('blob:https://evil.com/test-id')).toBe(false);
    expect(isLocalOnlyMapUrl('/\\evil.com/tile.png')).toBe(false);
  });

  it('accepts valid synthetic coordinates including boundaries and valid negative values', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-33.5, -70.25)).toBe(true);
    expect(isValidCoordinate(10.5, 106.5)).toBe(true);
  });

  it('rejects null, undefined, NaN, Infinity, out-of-range, and garbage strings safely', () => {
    const invalidCases: [unknown, unknown][] = [
      [null, 106.5], [10.5, undefined], [Number.NaN, 106.5],
      [10.5, Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY, 106.5],
      [90.001, 106.5], [-90.001, 106.5], [10.5, 180.001], [10.5, -180.001],
      ['10.5', '106.5'], ['not-a-coord', {}],
    ];
    for (const [lat, lng] of invalidCases) expect(isValidCoordinate(lat, lng)).toBe(false);
  });

  it('filters mixed datasets without throwing, dropping valid records, or logging coordinates', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const snapshot = [
      { id: 'syn-1', latitude: 10.25, longitude: 106.25 },
      { id: 'bad-nan', latitude: Number.NaN, longitude: 106.25 },
      { id: 'bad-range', latitude: 999, longitude: 106.25 },
      { id: 'bad-null', latitude: null as unknown as number, longitude: 106.25 },
      { id: 'syn-2', latitude: 11.75, longitude: 107.25 },
    ];
    expect(filterValidCoordinates(snapshot, (item) => item).map((item) => item.id)).toEqual(['syn-1', 'syn-2']);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('builds local PMTiles style and schematic fallback style with zero external http(s) URLs', () => {
    const basemapStyle = buildLocalBasemapStyle();
    assertZeroExternalUrls(basemapStyle);
    expect(basemapStyle.glyphs).toBe(LOCAL_GLYPHS_URL);
    const basemap = basemapStyle.sources['basemap'];
    expect(basemap?.type).toBe('vector');
    if (basemap?.type === 'vector') expect(basemap.url).toBe(LOCAL_PMTILES_URL);

    const schematicStyle = buildLocalSchematicStyle();
    assertZeroExternalUrls(schematicStyle);
    expect(schematicStyle.glyphs).toBeUndefined();
    expect(schematicStyle.sources['schematic-grid']?.type).toBe('geojson');
    expect(buildLocalGisStyle('schematic')).toEqual(schematicStyle);
  });

  it('switches to schematic mode outside EVNSPC coverage or on PMTiles/WebGL error without online fallback', () => {
    expect(isWithinEvnspcCoverage(10.5, 106.5)).toBe(true);
    expect(isWithinEvnspcCoverage(21.0, 105.8)).toBe(false);
    expect(resolveLocalMapMode([{ latitude: 10.5, longitude: 106.5 }])).toBe('pmtiles');
    expect(resolveLocalMapMode([{ latitude: 21.0, longitude: 105.8 }])).toBe('schematic');
    expect(resolveLocalMapMode([{ latitude: 10.5, longitude: 106.5 }], 'schematic')).toBe('schematic');

    let errorHandler: ((event?: { error?: { name?: string } }) => void) | null = null;
    const setStyle = vi.fn();
    const fakeMap = {
      on: vi.fn((event: string, handler: (event?: { error?: { name?: string } }) => void) => {
        if (event === 'error') errorHandler = handler;
      }),
      setStyle,
    } as unknown as Pick<MapLibreMap, 'on' | 'setStyle'>;
    const onFallback = vi.fn();

    attachLocalPmtilesFallback(fakeMap, 'pmtiles', onFallback);
    // AbortError khi pan/zoom nhanh không được làm tụt nhầm sang schematic.
    errorHandler!({ error: { name: 'AbortError' } });
    expect(setStyle).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();

    errorHandler!({ error: { name: 'Error' } });
    errorHandler!();
    expect(setStyle).toHaveBeenCalledTimes(1);
    assertZeroExternalUrls(setStyle.mock.calls[0][0] as StyleSpecification);
    expect(onFallback).toHaveBeenCalledTimes(1);

    const container = document.createElement('div');
    const onWebGlFallback = vi.fn();
    expect(createLocalGisMap(container, { mode: 'pmtiles', onFallbackToSchematic: onWebGlFallback })).toBeNull();
    expect(container.dataset['gisFallback']).toBe('schematic');
    expect(onWebGlFallback).toHaveBeenCalledTimes(1);
  });
});
