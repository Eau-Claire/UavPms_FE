# UAV-PMS Frontend — AI-Native Engineering Map

Angular 21 frontend for UAV Powerline Monitoring System (UAV-PMS).
Keep this file concise (~100 lines). Detailed workflows live in `.agents/skills/` (load on demand) and `docs/`.

## 1. Fast Verification Commands

Run the narrowest check during iteration and `npm run verify:all` before any PR:

```bash
npm run verify:all                                  # policy + arch + lint + unit tests + build
npm run check:policy                                # UAV security guard (no online maps, secret/log leaks)
npm run check:arch                                  # Feature/layer import boundary check
npm run lint                                        # ESLint (TS + Angular + template a11y)
npx ng test --watch=false --include=<spec-path>     # Targeted Vitest spec
npx ng test --watch=false                           # Full Vitest suite
npm run build                                       # Production bundle check
npm run test:e2e                                    # Playwright E2E suite
```

## 2. Repository Map

- `src/app/core/` — Auth (`authGuard`, `roleGuard`, JWT interceptor), facility store, HTTP interceptors, layout shell, SignalR/serial services.
- `src/app/models/` — Strict domain TypeScript interfaces (no Angular UI dependencies).
- `src/app/shared/` — Reusable UI primitives, pipes, error/status mappers, idempotency helpers (must NOT import from `features/`).
- `src/app/features/<domain>/` — Lazy-loaded feature modules:
  - `data-access/` — API transport, payload normalizers, signal stores (ONLY layer allowed to parse raw API payloads or inject `HttpClient`).
  - `pages/` & `components/` — Presentation & orchestration (`OnPush`, signals). Features must NOT cross-import each other.
- `specs/` — Living specs (`spec.md`, `acceptance.md`, `tasks.md`) and 10-column traceability matrix (`specs/RTM.md`).
- `docs/` — Reference specs: `AI_SECURITY_AND_GOVERNANCE.md` (mandatory), `api_spec.md`, `ANGULAR_ARCHITECTURE.md`, `mainflows/`. *(Note: ignore legacy React sections in `CODING_STANDARDS.md`.)*

## 3. Non-Negotiable Engineering Rules

- **TypeScript**: Strict mode; infer obvious types; never use `any` (use `unknown` + boundary validation).
- **Angular 21**: Standalone components by default (**do NOT** set `standalone: true` in decorators); `ChangeDetectionStrategy.OnPush`; `inject()` instead of constructor DI; `input()`/`output()`/`computed()`; signals with `.set()`/`.update()` (never `.mutate()`).
- **Templates**: Native control flow (`@if`, `@for`, `@switch`); no `ngClass`/`ngStyle` (use `[class.*]`/`[style.*]`); no `@HostBinding`/`@HostListener` (use `host` metadata); `NgOptimizedImage` for static images (not base64); Reactive forms; no unguarded globals (`new Date()`).
- **Accessibility**: Must pass AXE / WCAG 2.2 AA (keyboard focus, contrast, ARIA, semantic roles).

## 4. Security & High-Risk Boundaries

Read `docs/AI_SECURITY_AND_GOVERNANCE.md` before touching auth, GIS, upload, or logging:
- **Sensitive data**: GIS coordinates, UAV images, defects, maintenance tickets, emails, JWTs. Never send to third-party AI/map/analytics services or log raw payloads.
- **Local-only GIS**: Maps MUST use local PMTiles / GeoJSON / local assets. Never add Google Maps, OSM, Mapbox, or remote tile/CDN fallbacks.
- **RBAC**: Roles are strictly `SystemAdmin`, `Manager`, `Inspector`, `Analyst`, `Technician`. Never invent roles; backend enforces authority; handle 401/403/refresh-loading gates safely.
- **Human-Approval-Required Zones** (stop & confirm plan before editing): `src/app/core/auth/**`, `src/app/features/gis/**`, `docs/AI_SECURITY_AND_GOVERNANCE.md`, `.github/workflows/**`.

## 5. AI-Native Execution Workflow

1. **Explore → Plan → Verify Plan → Code → Verify**: Read target files first, state scope & non-goals, get plan approval for non-trivial changes, then edit and verify.
2. **Spec & Gate 5 (Features)**: For new features or mainflow changes, create `specs/<REQ-ID>-<slug>/` (`spec.md` + `acceptance.md`) and lock acceptance tests BEFORE generating implementation code. Update `specs/RTM.md`.
3. **Small Batches**: Keep PRs under 300–400 changed lines. Split large changes into stacked PRs (`models + data-access` → `UI + E2E`).
4. **Independent Verification**: Never rely on the coding session alone to declare quality. Run `npm run verify:all` and perform an independent diff review using `.agents/skills/pr-review-judge/SKILL.md`.

## 6. On-Demand Skills (`.agents/skills/`)

Load only the skill relevant to the current task:
- `angular-feature/SKILL.md` — Implementing or refactoring Angular 21 features (`data-access` → store → UI → Vitest).
- `uav-security-gate/SKILL.md` — Auditing UAV-PMS security, RBAC, local-only GIS, and PII/secret hygiene.
- `playwright-e2e/SKILL.md` — Writing role-based Playwright E2E and WCAG AA accessibility tests.
- `pr-review-judge/SKILL.md` — Running an independent LLM-as-Judge review on a PR diff against its spec.
