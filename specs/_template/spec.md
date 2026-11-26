# [REQ-XXX] Feature Title

- **Req ID**: `REQ-XXX` (immutable, never reuse)
- **Status**: `proposed` | `confirmed` | `in-progress` | `released` | `rejected`
- **Owner (BA/PO)**: `<name>`
- **Named Approver (Tech/Security)**: `<name>` *(must differ from the person prompting the coding agent)*
- **Data Classification** *(per `docs/AI_SECURITY_AND_GOVERNANCE.md`)*: `Public` | `Internal` | `Sensitive` | `Restricted`

## 1. Problem & Goal (What & Why)

<!-- Describe the business problem, target user roles (SystemAdmin, Manager, Inspector, Analyst, Technician), and measurable outcome. -->

## 2. Scope & Non-Goals

- **In Scope**:
  - ...
- **Non-Goals (Explicitly Out of Scope)**:
  - ...

## 3. Domain & API Contract

- **Referenced Endpoints** *(from `docs/api_spec.md`)*:
  - `GET /...`
- **RBAC Matrix**:
  - Allowed roles: `...`
  - Denied roles (expected `403` / hidden route): `...`
- **State & Boundary Rules**:
  - Normalizer behavior on partial/malformed payloads: `...`
  - Loading / Empty / Error / Session-expired behaviors: `...`

## 4. Security, Privacy & NFRs

- [ ] No third-party map/tile/AI/analytics endpoints (local-only PMTiles/assets).
- [ ] No sensitive data (JWT, email, GPS, UAV images) logged or exposed in URLs.
- [ ] AI outputs (if any) require explicit human `Pending → Approved/Rejected` confirmation.
- [ ] WCAG 2.2 AA compliance (keyboard navigation, focus trap in modals, ARIA labels).
- [ ] Performance budget: feature route ≤ 100 KB gzip, LCP ≤ 2.5s, INP ≤ 200ms.
