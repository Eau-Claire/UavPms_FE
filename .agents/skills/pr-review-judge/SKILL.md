---
name: pr-review-judge
description: Independent LLM-as-Judge PR review rubric to run in a clean session against git diff and the feature spec before human approval.
---

# Independent PR Review Judge

Run this skill in a **separate, clean agent session** (never the same session that generated the code).

## Inputs Required

1. `git diff origin/main...HEAD` (or staged diff).
2. Linked `specs/<REQ-ID>/spec.md` and `specs/<REQ-ID>/acceptance.md` (if feature PR).

## Review Rubric (Check in Order)

1. **Scope Discipline**:
   - Did the PR touch files outside the stated task/spec? Flag any unrequested refactors or "drive-by" edits.
   - Is the PR size within Small Batches guidelines (≤ 400 lines excluding lockfiles)?
2. **Correctness & Edge Cases**:
   - Compare every acceptance criterion in `acceptance.md` against the implementation and tests.
   - Look for subtle logic bugs: race conditions, stale signal reads, missing `track` keys, unhandled `401`/`403`/empty/null responses.
3. **Test Integrity (Anti "Perpetually Green")**:
   - Do tests actually fail if the core business logic is broken?
   - Flag tests that only mock everything away or assert trivial rendering without checking behavior.
4. **UAV-PMS Security & Angular Compliance**:
   - Check `uav-security-gate` rules (local-only maps, RBAC, no secret/PII logging, no unsanitized HTML).
   - Check Angular 21 rules (no `any`, `OnPush`, signals, `inject()`, no cross-feature imports).

## Output Format

Return a concise verdict: **`APPROVE_FOR_HUMAN_REVIEW`** or **`CHANGES_REQUESTED`**, followed by:
- **Blocking issues** (file:line + why + concrete fix)
- **Non-blocking suggestions** (max 3)
- **Uncovered acceptance criteria** (if any)
