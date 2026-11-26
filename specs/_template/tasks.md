# [REQ-XXX] Small-Batch Execution Plan

> Keep each PR under **300–400 changed lines** (excluding lockfiles). Check off tasks only after `npm run verify:harness` and targeted tests pass.

## Batch 1 — Models & Data Access (`models/` + `data-access/`)
- [ ] Define/update strict domain types in `src/app/models/<domain>.models.ts`
- [ ] Implement/update API normalizer & signal store in `src/app/features/<domain>/data-access/`
- [ ] Write unit tests from `acceptance.md` (valid, malformed, 401/403, network error)
- [ ] Open PR #1 (target ≤ 300 lines) & run `.agents/skills/pr-review-judge/SKILL.md`

## Batch 2 — UI Components & Routes (`pages/` + `components/`)
- [ ] Implement standalone `OnPush` components using signals, `inject()`, and native `@if/@for`
- [ ] Wire `authGuard` / `roleGuard` and loading/empty/error/403 states
- [ ] Write component unit tests + Playwright E2E spec using `getByRole()`
- [ ] Run `npm run verify:all` and update `specs/RTM.md`
- [ ] Open PR #2 (target ≤ 400 lines) & request Named Approver review
