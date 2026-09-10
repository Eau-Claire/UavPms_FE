# EVNSPC offline basemap

`evnspc-south-z12.pmtiles` is a self-hosted Protomaps vector-basemap extract for
southern Vietnam. The browser reads it from the same origin as the frontend, so
mission viewports and asset coordinates are not disclosed to an external map
provider at runtime.

- Source snapshot: Protomaps daily build `20260909.pmtiles`
- Geographic extract: `102.0,8.0,109.6,16.2`
- Maximum data zoom: `12` (the UI may overzoom for mission markers)
- Basemap data: OpenStreetMap contributors, ODbL
- PMTiles tooling: Protomaps, BSD-3-Clause
- Local label glyphs: Noto Sans Regular from `protomaps/basemaps-assets`, SIL Open Font License 1.1

Rebuild the checked-in extract with:

```bash
docker run --rm -v "$PWD/public/maps:/data" \
  ghcr.io/protomaps/go-pmtiles:v1.31.2 extract \
  https://build.protomaps.com/20260909.pmtiles \
  /data/evnspc-south-z12.pmtiles \
  --bbox=102.0,8.0,109.6,16.2 --maxzoom=12 --download-threads=8
```

EVNSPC service-area organization follows the official restructuring effective
1 July 2025: An Giang, Ca Mau, Can Tho, Dong Nai, Dong Thap, Lam Dong, Tay Ninh,
and Vinh Long. Binh Duong and Ba Ria - Vung Tau were transferred to EVNHCMC;
Ninh Thuan was transferred to EVNCPC.
