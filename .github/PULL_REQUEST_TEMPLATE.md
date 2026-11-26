<!-- Title format: [<type>:<scope>] <short summary> (e.g., [feat:missions] Add target spatial validation) -->

## 1. Traceability & Intent (Gates 1–4)
- **Req ID**: `REQ-XXX` *(or `chore/bugfix` for small non-spec fixes)*
- **Spec / Acceptance Link**: `specs/<REQ-ID>-.../spec.md` *(if feature/mainflow change)*
- **RTM Updated**: [ ] Yes (`specs/RTM.md`) / [ ] N/A (small bugfix)
- **Authoring Mode**: [ ] Human-written / [ ] AI-Assisted / [ ] AI-Generated (Agent)
- **Named Approver**: `@<reviewer-handle>` *(must differ from the person prompting the AI)*

### Summary
<!-- Briefly describe WHAT changed and WHY. Include explicit Non-Goals if relevant. -->

## 2. Gate 5 — Verification & Test Integrity
- [ ] Tests were written from `acceptance.md` / spec (not generated solely from implementation).
- [ ] `npm run verify:harness` passed (`check:policy`, `check:arch`, `lint:changed`).
- [ ] `npx ng test --watch=false` and `npm run build` passed with 0 errors.
- [ ] Relevant Playwright E2E tests passed on an **unhealed** run (or N/A).
- [ ] Independent diff review completed (clean session via `.agents/skills/pr-review-judge/SKILL.md` or peer review).

## 3. UAV-PMS Security & Governance Gate
- [ ] **Local-only GIS**: No external map/tile/geocoder/analytics URLs added.
- [ ] **Data Hygiene**: No real JWT, password, email, GPS, UAV image, or production payload in code/tests/logs.
- [ ] **Auth / RBAC**: Protected routes use `authGuard`/`roleGuard`; `401`/`403`/loading gates handled safely.
- [ ] **High-Risk Sign-off**: If touching `core/auth/`, `features/gis/`, uploads, or logging, ATTT/Owner sign-off requested.

## 4. Small Batches & Angular 21 Quality
- [ ] PR size is within Small Batches target (≤ 400 changed lines, excluding lockfiles) or justified below.
- [ ] Standalone components (no `standalone: true`), `OnPush`, signals, `inject()`, native `@if/@for/@switch`, WCAG 2.2 AA.
