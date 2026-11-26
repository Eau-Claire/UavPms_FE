# Requirements Traceability Matrix (RTM — 10 Columns)

> Living traceability ledger for UAV-PMS Frontend. Update at every Gate (Spec confirmed → Gate 5 Agreed Test List → PR opened → Named Approver merged → Released).
> When requirements change, mark linked artifacts as `stale` and update `acceptance.md` BEFORE asking a coding agent to modify code.

| Req ID | Source & Date | Priority | Status | Agreed Test List (Gate 5) | Story / Spec | Pull Request | Author (Human / Agent) | Named Approver | Release |
|---|---|---|---|---|---|---|---|---|---|
| `REQ-MF01` | `docs/mainflows/MF01_v2.0_FE_PreMission_Readiness.md` | P0 | `confirmed` | `e2e/pre-mission-readiness.spec.ts` | [MF01 Spec](../docs/mainflows/MF01_v2.0_FE_PreMission_Readiness.md) | *baseline* | Human + AI-Assisted | *TBD* | `v2.0` |
| `REQ-MF02` | `docs/mainflows/MF02_v2.0_FE_Create_Assign_Mission.md` | P0 | `confirmed` | `e2e/mission-spatial-selection.spec.ts` | [MF02 Spec](../docs/mainflows/MF02_v2.0_FE_Create_Assign_Mission.md) | *baseline* | Human + AI-Assisted | *TBD* | `v2.0` |
| `REQ-001` | AI-Native Step 2 Pilot (2026-11-26) | P1 | `confirmed` | [acceptance.md](./REQ-001-reports-hardening/acceptance.md) + `reports-page.spec.ts` | [REQ-001 Spec](./REQ-001-reports-hardening/spec.md) | *working tree (Small Batch)* | AI Agent + Human | Independent Judge + Human Owner | *pending* |
