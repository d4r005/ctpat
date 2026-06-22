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
