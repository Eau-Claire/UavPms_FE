# [REQ-001] Reports Page Hardening, Accessibility & Test Coverage

- **Req ID**: `REQ-001`
- **Status**: `confirmed`
- **Owner (BA/PO)**: Frontend Owner
- **Named Approver (Tech/Security)**: Independent PR Review Judge + Human Approver
- **Data Classification** *(per `docs/AI_SECURITY_AND_GOVERNANCE.md`)*: `Internal` (report metadata & summaries; synthetic scrubbed data only in tests)

## 1. Problem & Goal (What & Why)

`ReportsPage` (`src/app/features/reports/pages/reports-page/`) is the first AI-Native SDD pilot module. Currently:
1. It has zero component unit tests (`reports-page.spec.ts` is missing).
2. Date parsing (`parseDateInputToIso`) accepts non-existent calendar dates (e.g., `31/02/2026`) which silently roll over in JavaScript `Date`.
3. Selectable table rows only respond to mouse click — keyboard users cannot focus or select a report to enable PDF/Excel download (`WCAG 2.2 AA` gap).
4. `loadReports()` does not surface a clear `403` access-denied message when backend RBAC rejects listing.

**Goal**: Harden `ReportsPage` with strict calendar date validation, keyboard-accessible row selection, explicit `403` error handling, and a comprehensive Vitest suite derived from Gate 5 acceptance criteria.

## 2. Scope & Non-Goals

- **In Scope**:
  - `src/app/features/reports/pages/reports-page/reports-page.ts`
  - `src/app/features/reports/pages/reports-page/reports-page.html`
  - `src/app/features/reports/pages/reports-page/reports-page.spec.ts` (new)
  - `specs/REQ-001-reports-hardening/*` and `specs/RTM.md`
- **Non-Goals (Explicitly Out of Scope)**:
  - No backend API contract changes or new endpoints.
  - No changes to `core/auth/`, `features/gis/`, or visual CSS redesign.
  - No refactoring of `ReportsApi` beyond what is already tested in `reports-api.spec.ts`.

## 3. Domain & API Contract

- **Referenced Endpoints**:
  - `GET /reports` (paginated list with `search`, `type`, `status`, `regionId`)
  - `GET /regions` (filter dropdown options)
  - `POST /reports` (create report with validated `dateFrom`/`dateTo`)
  - `GET /reports/:id/download?format=pdf|excel`
- **RBAC & Error Rules**:
  - `403` on list load displays explicit access-denied banner (`Bạn không có quyền xem danh sách báo cáo.`) without showing stale rows.
  - `403` on download displays explicit access-denied toast (`Bạn không có quyền tải báo cáo <code>.`).

## 4. Security, Privacy & NFRs

- [x] No third-party map/tile/AI/analytics endpoints.
- [x] Scrubbed synthetic test fixtures only (no real emails, tokens, or grid coordinates).
- [x] WCAG 2.2 AA: keyboard focusable & selectable rows (`tabindex="0"`, `Enter`/`Space`, `aria-selected`).
- [x] Small Batches: total diff ≤ 400 lines.
