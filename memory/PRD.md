# PRD — Inspección 19 Puntos NAF (Mobile App)

## Overview
Spanish-language mobile app (Expo SDK 54 + FastAPI + MongoDB) that digitizes the NAF physical "Inspección 19 Puntos de Camiones y Remolques" form for transport security inspectors. Supports offline work in the yard with later sync.

## User Choices (locked)
- Auth: Simple email + password (JWT)
- Photo evidence: NO (text only)
- Reports: PDF export + share + in-app history
- Signature: Drawn signature + name
- Offline: Full offline mode with queue + auto-sync

## Features
1. **Auth** — Register / Login / persistent JWT in SecureStore
2. **Inicio (Dashboard)** — Today's inspections, stats (total, aprobadas, con fallas), offline banner, pending sync banner, FAB to start new
3. **Histórico** — Search + filter (Todos / Bueno / Con falla), tap to view detail
4. **Nueva Inspección (4-step Wizard)**
   - Step 1: Datos generales (compañía, placas, tráiler, precinto, sello alta seguridad, sello verificado)
   - Step 2: 19 inspection points with large Bueno/Malo toggles. Auto-expanding `Comentarios` only on Malo
   - Step 3: Reporte actividad sospechosa
   - Step 4: Inspector signature (drawn + name) + optional Verificador signature
5. **Detalle Inspección** — Read-only view with status banner, full data + PDF export & share
6. **Perfil** — User info, stats, manual sync trigger, sign out
7. **Offline-first** — AsyncStorage cache + queue + auto-sync when reconnected (`@react-native-community/netinfo`)

## Backend (FastAPI + MongoDB)
- `POST /api/auth/register` — email, password (≥6), name → JWT + user
- `POST /api/auth/login` — email, password → JWT + user
- `GET /api/auth/me` — current user (JWT required)
- `POST /api/inspections` — create inspection (JWT). Dedup via `client_uuid`. Auto-computes `status_general` from points
- `GET /api/inspections` — list user's inspections (JWT) sorted desc by created_at
- `GET /api/inspections/{id}` — single inspection (JWT, owner-only)

bcrypt + pyjwt (HS256, 30-day expiry).

## Frontend
- Brutalist industrial design: navy (#0A2540) brand, safety yellow (#F59E0B) accent, green/red status, large gloved-hand targets, sharp 2px borders, radius 0–4.
- Bottom tabs: Inicio · Histórico · Nueva · Perfil
- `react-native-signature-canvas` for signatures
- `expo-print` + `expo-sharing` for PDF generation and sharing

## Smart Business Enhancement
Offline queue with auto-sync ensures **zero data loss** in low-connectivity yards. Inspectors never wait — completed inspections are immediately usable (visible in history with PENDIENTE chip), then automatically uploaded when signal returns. Each inspection auto-flags `bueno` vs `con falla` for fast supervisor scanning.

## Iteration 2 — Multi-User + CSV + Scanner + Web

### Backend additions (server.py)
- `role` field on users: `inspector` | `supervisor`. The **first** ever registered user automatically becomes supervisor.
- `active` flag on users; deactivated accounts can't login (`403`) and their existing tokens are rejected.
- `approval_status` on inspections: `pendiente` | `aprobada` | `rechazada` + `approval_note` + `approved_by_name` + `approved_at`.
- New endpoints:
  - `GET /api/users` (supervisor) — list all users
  - `POST /api/users/create-inspector` (supervisor) — create inspector or supervisor account
  - `POST /api/users/{id}/toggle-active` (supervisor) — flip active flag (cannot deactivate self)
  - `GET /api/inspections?scope=all|mine&inspector_id=...` (supervisor with `scope=all`)
  - `POST /api/inspections/{id}/approve` + `/reject` (supervisor) — workflow with note
  - `GET /api/inspections/export?mode=summary|detailed&scope=mine|all` — CSV streaming response (text/csv)

### Frontend additions
- **Role-aware bottom tabs**: Supervisor tab (`shield-checkmark`) visible only for supervisors.
- **Supervisor screen** (`/(app)/supervisor`): stats cards (Total/Pend/Aprob/Rech), search, 4 filter chips, 3 export buttons (CSV resumen, CSV detallado, Usuarios).
- **Usuarios screen** (`/(app)/usuarios`): list with role chips, toggle active/desactivate, modal to create new inspector/supervisor.
- **Inspection detail** now shows `ACCIÓN DE SUPERVISOR` box (note input + APROBAR/RECHAZAR buttons) and a permanent approval badge once acted on.
- **Barcode scanner** (`src/components/BarcodeScanner.tsx`) using `expo-camera`. Buttons next to **placas, tráiler, precinto** in step 1 of Nueva. Web shows a Spanish info screen (camera scanner requires native build).
- **CSV download**: web uses `fetch` + blob anchor; native uses `expo-file-system` + `expo-sharing`.
- **Responsive web**: same UI, supervisor row uses wider layout on screens ≥900px.

### Testing
- Backend: 18/18 new pytest cases PASS (auth/role/active gating, approval workflow, CSV summary vs detailed)
- Frontend: validated on both 1280x800 (web) and 390x844 (mobile)

