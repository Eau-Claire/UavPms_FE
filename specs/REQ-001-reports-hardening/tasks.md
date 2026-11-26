# [REQ-001] Small-Batch Execution Plan

## Single Small Batch (Target ≤ 350 lines)
- [x] Lock `spec.md` and `acceptance.md` (Gate 5)
- [x] Fix `parseDateInputToIso` in `reports-page.ts` to reject impossible calendar dates (e.g., `31/02/2026`)
- [x] Handle `403 Forbidden` explicitly in `loadReports()` error branch, clearing `pageCache`, stale rows, selection, and pagination totals
- [x] Reject whitespace-only report titles on create
- [x] Add `tabindex="0"`, `[attr.aria-selected]`, `(keydown.enter)`, and `(keydown.space)` to selectable rows in `reports-page.html`
- [x] Write `reports-page.spec.ts` covering 100% of Gate 5 acceptance criteria (hardened after independent Judge review)
- [x] Verify: ESLint on `reports`, `check:policy`, `check:arch`, Vitest, `npm run build`
- [x] Run independent LLM-as-Judge review via `.agents/skills/pr-review-judge/SKILL.md` and resolve all blocking findings
- [x] Update `specs/RTM.md` with traceability evidence
