# Angular architecture

## Structure

```text
src/app/
├── core/                 # API, auth, guards, interceptors, shell
├── shared/components/    # reusable presentation primitives
└── features/
    ├── auth/             # account flows
    ├── monitor/          # API, store, widgets, dashboard, history
    ├── assets/           # asset workspace
    ├── users/            # administration workspace
    └── shared/           # cross-feature routed pages
```

## State and data

Signals hold component and feature state. `MonitorStore` owns polling, loading, stale-data, error, pagination, and inspection state. `MonitorApi` owns transport and payload normalization. Components never parse backend responses.

The live OpenAPI document omits Monitor response schemas. Normalizers accept the API envelope and common field aliases while returning strict internal models. Generated types can replace this boundary when schemas become available.

## Monitor endpoints

- `GET /monitor/summary`
- `GET /monitor/recent-defects?page&pageSize`
- `GET /monitor/defects-statistics`
- `GET /monitor/mission-status`
- `GET /monitor/inspections?missionId&isDefect&fromDate&toDate&page&pageSize`
- `GET /monitor/alerts`

Swagger uses `defects-statistics` (plural), unlike the original task wording.

## Real-time extension

`MonitorStore` is the SignalR seam. Add hub events beside polling and update existing signals; widgets remain transport-independent.

## Quality targets

- Desktop/corporate network primary profile.
- LCP ≤ 2.5 seconds, INP ≤ 200 ms, CLS ≤ 0.1 at p75.
- Initial JavaScript ≤ 220 KB gzip; feature route ≤ 100 KB gzip.
- Lighthouse accessibility ≥ 95; WCAG 2.2 AA.
