---
name: uav-security-gate
description: Mandatory UAV-PMS security and data governance audit checklist for auth, GIS, uploads, logging, and AI-assisted UI features.
---

# UAV-PMS Security & Governance Gate

Load this skill before modifying or reviewing `core/auth/`, `features/gis/`, file uploads, logging, or AI-analysis/analyst-review flows.

## Mandatory Checks

1. **Zero Data Leakage & Local-Only GIS**:
   - Verify ZERO references to third-party map tiles, geocoders, analytics, or external CDNs (`maps.googleapis.com`, `openstreetmap.org`, `mapbox.com`, etc.).
   - Verify GIS/Mission maps use local PMTiles / local GeoJSON / local schematic fallback only.
   - Verify no real tokens, emails, GPS coordinates, UAV images, or production payloads exist in code, tests, fixtures, screenshots, or logs.
2. **Auth, Session & RBAC**:
   - Protected routes use `authGuard`; sensitive routes/actions use `roleGuard` with exact roles (`SystemAdmin`, `Manager`, `Inspector`, `Analyst`, `Technician`).
   - During token refresh / session verification, show a loading gate — never flash stale protected UI.
   - `401` triggers safe logout/login redirect; `403` renders a clear access-denied state without leaking data.
3. **Untrusted Input & AI Output**:
   - No unsanitized `[innerHTML]` or unapproved `bypassSecurityTrustHtml`.
   - File uploads enforce MIME/extension allowlist, size limits, and safe error messages.
   - AI detection results remain `Pending/Approved/Rejected` and require explicit human approval — AI must never auto-approve defects, close maintenance tickets, or change permissions.
4. **Automated Check**:
   - Run `npm run check:policy` and confirm exit code `0`.
   - Flag any item requiring Security/Legal (ATTT/Pháp chế) sign-off in the PR summary.
