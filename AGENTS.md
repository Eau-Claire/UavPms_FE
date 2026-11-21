You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## UI Consistency & Standardized Formatting Protocol

When modifying, adding, or styling any UI element, the Agent MUST strictly adhere to the project's design system and maintain visual consistency across all homogeneous items:

- **Baseline Inspection First**:
  - Before modifying the style, layout, or formatting of any UI element (buttons, cards, table cells/headers, badges, dialogs, form inputs, typography), inspect existing sibling components or the design tokens in `src/styles/reference/globals.css`.
  - Establish a single set of formatting parameters (colors, font size, font weight, padding, border radius, spacing) as the standard baseline.
- **Uniform Propagation (No Ad-hoc / One-Off Styling)**:
  - NEVER apply arbitrary, isolated, or one-off styles to a single item that leaves other items of the same type with differing formats.
  - Any formatting change made to one item MUST be systematically propagated to ALL sibling and homogeneous items in the view/component (e.g., if updating the styling of a status badge or table column, all badges or columns of that category must match).
- **Design System & Token Compliance**:
  - Use project design tokens (`--color-primary`, `--evn-*`, Tailwind utility classes) instead of hardcoded hex colors, magic numbers, or arbitrary pixel values.
  - Buttons, tables, and dialogs must adhere to standard EVN / Ant Design patterns (`.evn-primary-button`, `.evn-table`, etc.).
- **Consistent Data Formatting**:
  - **Date/Time**: Use standardized Angular date pipes (e.g., `dd/MM/yyyy HH:mm`) uniformly across all views.
  - **Status & Badges**: Centralize badge variant mappings (e.g., via `src/app/shared/status/status.ts`); do not invent different colors for the same status across different pages.
  - **Numbers / Metrics**: Use uniform decimal precision and thousand separators.
- **Component Reusability**:
  - If a specific UI pattern or formatted element repeats across more than one location, extract or utilize a reusable component in `src/app/shared/` instead of duplicating divergent inline templates.
- **Universal Bidirectional Navigability & Symmetrical Data Consistency**:
  - **Zero Dead-End URLs (Bidirectional Navigability)**: Every detail page (routes with `:id` parameters) MUST be reachable from a parent listing/table/map page, and MUST provide an interactive Breadcrumb trail and a Back button (`goBack()`).
  - **Context-Aware Breadcrumbs & Back Navigation**: When entering a detail page from a secondary context (e.g. from `/gis` or `/towers/:id` to `/ai-review/:id`), the breadcrumbs and Back action MUST reflect and return to that referring origin, preserving filters/state.
  - **Interactive Breadcrumb Hierarchy**: Every intermediate level in breadcrumbs MUST be an interactive, clickable link (`[routerLink]` or `<a>`), never a non-interactive plain `<span>`.
  - **Symmetrical Data Visibility (List-Detail Parity)**: Any entity that can be viewed in detail (`/:id`) MUST be findable and visible in the corresponding collection/table view. Never restrict table views to a partial sub-state (e.g., only "Pending") without providing filter controls (Status Tabs: "Tất cả", "Chờ thẩm định", "Đã xác nhận", "Đã từ chối", "Đã xử lý") that allow finding entities across all valid lifecycle states.

## Architecture Boundaries & Anti-Slop Enforcements (ESLint Enforced)

- **Banned Error-Prone / Nuanced APIs**:
  - `setTimeout`, `setInterval`, `requestAnimationFrame`, `clearTimeout`, `clearInterval` are banned in application code.
  - Do NOT use timers as workarounds for change detection or race conditions. Use Angular signals or RxJS operators (`delay`, `timer`) with `takeUntilDestroyed()`.
- **Zero Raw DOM Queries**:
  - Do NOT use `document.getElementById`, `document.querySelector`, or direct DOM access. Use Angular's `viewChild()` / `viewChildren()` signal queries or `ElementRef`.
- **Subscription Lifecycle (Zero Memory Leaks)**:
  - Every manual `.subscribe()` MUST use `takeUntilDestroyed()` or `take(1)`. Prefer Angular signals (`toSignal`) or the template `async` pipe.
- **Zero Debug Artifacts**:
  - `console.log` and `debugger` are strictly banned by ESLint (only `console.error` and `console.warn` are permitted for exceptional errors).
- **Directory Structure as Hard Architectural Boundaries**:
  - `src/app/core/` must NEVER import from `src/app/features/`.
  - `src/app/shared/` must NEVER import from `src/app/features/`.
  - `src/app/models/` must be pure contracts and never import from `core/`, `shared/`, or `features/`.
  - **Cross-feature isolation**: A feature in `src/app/features/<A>/` must NEVER import directly from `src/app/features/<B>/`. Shared capabilities must live in `core/` or `shared/`.
- **Zero Arbitrary Comments (Anti-Slop / Escape-Hatch Ban)**:
  - Arbitrary comments (`// ...` or `/* ... */`) are strictly banned by ESLint.
  - Do NOT write comments explaining workarounds, hacks, or why code was bypassed. Fix the root cause in code or express constraints using TypeScript types or ESLint rules.
  - Only JSDoc blocks (`/** ... */`) are permitted for public API / component interface documentation.
- **Boy Scout Rule for Touched Files**:
  - Whenever an Agent touches or creates a file, it MUST resolve all pre-existing ESLint and TypeScript issues in that specific file. Never leave a touched file with active lint errors.

## Continuous Rule Hardening & Zero-Regression Protocol ("Fix the Bug, Freeze the Rule")

No mistake shall ever be repeated. Whenever a bug is found, an anti-pattern is caught, or the user corrects the Agent, the Agent MUST treat the task as incomplete until an enforceable constraint is put in place:

1. **Rule Hardening Priority (The Enforceability Pyramid)**:
   - **Level 1 (Highest - Machine Enforced)**: Add or update a rule in `eslint.config.js` if the issue can be caught via AST, imports, banned globals, syntax, or formatting.
   - **Level 2 (Compiler Enforced)**: Tighten TypeScript types (discriminated unions, branded types, `readonly`, `never`) so illegal states cannot compile.
   - **Level 3 (Test Enforced)**: Add an automated regression unit test or E2E test verifying the fix.
   - **Level 4 (Directive Enforced)**: Add an explicit guideline into `AGENTS.md` and use the `/learn` slash command to persist the correction.
2. **Never Just "Patch and Move On"**: Fixing a bug without updating its corresponding guardrail is considered incomplete work. Every bug fix must leave the codebase safer against its recurrence.

## Agent Development Workflow & Lifecycle

For any non-trivial task (feature implementation, bug fix, or refactoring), follow this structured pipeline:

### Phase 1: Discovery & Scoping (Pre-Code)
- **Context Inspection**: Inspect related components, services, models, and API contracts before touching code.
- **Scope & Constraints**: Identify impacted files, state flow, dependencies, edge cases, and accessibility requirements.
- **UI Baseline Inspection**: When touching UI, inspect existing homogeneous elements and project design tokens (`globals.css`) to define standard formatting parameters.
- **Clarification**: Ask clarifying questions if requirements or contracts are ambiguous. Avoid unverified assumptions.
- **Implementation Plan**: For non-trivial tasks, outline a concise step-by-step implementation plan (impacted files, signals/state flow, verification strategy) and confirm before proceeding.

### Phase 2: Implementation (In-Code)
- **Atomic Iterations**: Implement in focused, incremental steps (e.g., Models/Interfaces -> Services/State -> Component logic -> Template).
- **Strict Compliance**: Strictly adhere to the Angular v20+ and TypeScript best practices above (Signals, OnPush, native control flow, no `standalone: true`, no `any`).
- **UI Uniformity**: Propagate any formatting changes across all sibling/homogeneous items; never leave mismatched or one-off styled elements.
- **Scope Discipline**: Keep changes minimal and focused on the requested task. Do not perform unrelated refactoring.

### Phase 3: Verification & Quality Assurance (Post-Code)
- **Type Safety & Build**: Ensure changes compile without TypeScript or Angular template errors.
- **Accessibility Audit**: Verify all UI elements meet WCAG AA standards and pass AXE checks (focus management, ARIA attributes, semantic HTML).
- **Testing**: Run or update relevant tests to prevent regressions.
- **Clear Reporting**: Summarize changes concisely with direct file links and highlight any remaining considerations.
