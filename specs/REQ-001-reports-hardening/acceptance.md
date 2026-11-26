# [REQ-001] Agreed Acceptance Test List (Gate 5)

> **Gate 5 Rule**: Locked BEFORE modifying `reports-page.ts` / `reports-page.html`. Every item below maps directly to unit tests in `reports-page.spec.ts`.

- **Approved By (QA/PO)**: Pilot Gate 5 Baseline
- **Approved Date**: `2026-11-26`

## 1. Happy Path & Core User Flows (Gherkin)

```gherkin
Feature: Reports Page Management

  Scenario: Initial load renders reports and enables download after row selection
    Given GET /reports returns 2 valid reports and GET /regions returns 1 region
    When ReportsPage initializes
    Then both reports render in the table and "Tải PDF" / "Tải Excel" buttons are disabled
    When the user selects the first report row
    Then "Tải PDF" and "Tải Excel" buttons become enabled
    And clicking "Tải PDF" requests downloadReportFile(id, 'pdf')

  Scenario: Filtering by type/status/region resets to page 1 and queries API
    Given ReportsPage has loaded page 1
    When the user changes type filter to "ThermalInspection" and status to "approved"
    Then listReports is called with type="ThermalInspection", status="approved", page=1
    And clicking "Xóa lọc" restores default filters

  Scenario: Creating a valid report submits normalized payload and refreshes list
    Given the user opens the "Lập báo cáo mới" modal
    When the user enters title "Báo cáo tuần 48", dateFrom "01/11/2026", dateTo "15/11/2026" and submits
    Then createReport is called with trimmed title and valid ISO date boundaries
    And the modal closes and listReports is refreshed with forceRefresh
```

## 2. Auth, RBAC & Error Edge Cases

- [ ] `403 Forbidden` on `listReports` renders explicit permission-denied message in `role="alert"` banner and clears/avoids stale data.
- [ ] Generic `500` / network error on `listReports` renders safe retryable error banner without raw stack traces.
- [ ] `403 Forbidden` on `downloadReportFile` triggers permission-denied toast and resets downloading state.
- [ ] Empty API response (`items: []`) renders the empty state row (`Không tìm thấy báo cáo nào phù hợp điều kiện lọc.`).

## 3. Date Validation Edge Cases

- [ ] Non-existent calendar date (e.g. `31/02/2026` or `31/04/2026`) is rejected with invalid date error toast and does NOT call `createReport`.
- [ ] `dateFrom` later than `dateTo` (e.g. `20/11/2026` > `10/11/2026`) is rejected and does NOT call `createReport`.
- [ ] Blank title blocks submission and marks title control touched.

## 4. Accessibility (WCAG 2.2 AA)

- [ ] Each report row has `tabindex="0"` and `aria-selected="false"` (toggling to `"true"` when selected).
- [ ] Pressing `Enter` or `Space` on a focused report row selects/deselects that report without requiring a mouse click.
