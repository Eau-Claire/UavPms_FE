---
name: playwright-e2e
description: Guidelines for writing and maintaining reliable Playwright E2E and WCAG AA accessibility tests in UAV-PMS Frontend.
---

# UAV-PMS Playwright E2E & Accessibility Skill

Load this skill when adding or updating tests under `e2e/`.

## Locator & Structure Rules

1. **Accessibility-Tree First**: Prefer `getByRole()`, `getByLabel()`, `getByPlaceholder()`, and `getByText()` over fragile CSS/XPath selectors.
2. **Scrubbed Synthetic Data Only**: Never use real grid coordinates, real user emails, or real UAV photos in fixtures. Use deterministic mock/scrubbed payloads.
3. **Assert Business Intent, Not Just Page Load**:
   - Avoid shallow assertions like `expect(page.locator('body')).toBeVisible()`.
   - Assert domain outcomes (status transitions, RBAC visibility/denial, form validation errors, totals/counts, API request payloads).
4. **WCAG 2.2 AA Verification**:
   - Verify keyboard navigation (`Tab`, `Enter`, `Escape`) on dialogs, forms, and action menus.
   - Verify visible focus states, dialog ARIA labels, and error announcements (`role="alert"`).
5. **Healer Governance Rule**:
   - CI gates MUST pass on the **unhealed** run.
   - If an AI healer proposes a selector patch, open a separate PR for human review to confirm it is an intentional UI change rather than a regression.
