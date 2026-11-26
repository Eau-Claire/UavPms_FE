---
name: angular-feature
description: Standard procedure for implementing or refactoring Angular 21 features in UAV-PMS Frontend following strict layer boundaries, signals, and Vitest verification.
---

# UAV-PMS Angular 21 Feature Skill

Load this skill when adding or refactoring code under `src/app/features/<domain>/`.

## Layering Contract (Enforced by ESLint & Arch Check)

1. **`src/app/models/<domain>.models.ts`**:
   - Define strict domain interfaces and union types. No Angular/UI imports.
2. **`src/app/features/<domain>/data-access/`**:
   - `*-api.ts`: Owns `HttpClient` calls and response normalization (`unknown` → strict domain model). Validate ranges, nulls, and coordinates at this boundary so one malformed record never breaks a valid snapshot.
   - `*-store.ts`: Owns signal state (`loading`, `error`, `data`, `stale`), `computed()` selectors, and async actions.
3. **`src/app/features/<domain>/pages/` & `components/`**:
   - Standalone components (omit `standalone: true`), `changeDetection: ChangeDetectionStrategy.OnPush`, `inject()`, `input()`, `output()`.
   - Never inject `HttpClient` or parse raw API envelopes in components.
   - Always render explicit **loading**, **empty**, **error**, and **403 forbidden** states.
   - Use native `@if`, `@for` (with `track`), `@switch`, `[class.*]`, `[style.*]`, and `host: {}` metadata.

## Testing Contract (Anti "Perpetually Green" Tests)

- Write unit tests from `acceptance.md` / `docs/api_spec.md` — NOT by mirroring implementation bugs.
- Every `data-access` spec MUST cover:
  1. Valid payload normalization.
  2. Malformed / partial / null payload handling without crashing.
  3. HTTP `401` / `403` / network error propagation.
- Every page/component spec MUST cover loading, error, empty, and key user interaction states.
- Run targeted test first: `npx ng test --watch=false --include=src/app/features/<domain>/**/*.spec.ts`.
