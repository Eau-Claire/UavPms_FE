# [REQ-XXX] Agreed Acceptance Test List (Gate 5)

> **Gate 5 Rule**: This test list MUST be reviewed and agreed by BA/PO, QA, and Dev **BEFORE** the coding agent generates implementation code. Unit and E2E tests must verify these behaviors directly — never copy assertions from buggy implementation code.

- **Approved By (QA/PO)**: `<name>`
- **Approved Date**: `YYYY-MM-DD`

## 1. Happy Path Scenarios (Gherkin)

```gherkin
Feature: <Feature Name>

  Scenario: Authorized user completes primary flow
    Given an authenticated user with role "<Role>"
    And valid scrubbed test data is loaded
    When the user performs "<action>"
    Then the UI updates to reflect "<business outcome>"
    And the expected API contract payload is sent
```

## 2. Auth, RBAC & Session Edge Cases

- [ ] Unauthenticated user visiting route is redirected to `/login` without flashing protected data.
- [ ] Unauthorized role receives `403` / access-denied state without leaking sensitive records.
- [ ] Expired session during action triggers safe refresh gate or logout.

## 3. Data Integrity & Resilience Edge Cases

- [ ] Malformed or partially null API record does not crash the view or drop valid records.
- [ ] Empty state renders clear guidance when list/result is empty.
- [ ] Network failure / `5xx` renders safe error banner with retry option (no raw stack trace).

## 4. Accessibility (WCAG 2.2 AA)

- [ ] All interactive controls are reachable and operable via keyboard (`Tab`, `Enter`, `Escape`).
- [ ] Form validation errors and status banners are announced with appropriate ARIA roles.
- [ ] Playwright E2E passes without selector auto-healing (`unhealed` run).
