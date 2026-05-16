# CLAUDE.md

---

# CLAUDE CODE RULES - SOLETRONIX LMS

## CRITICAL BEHAVIOR

- ALWAYS ANSWER IN CAVEMAN STYLE. Short. Grunt words. 3-6 words max. No filler.
- ALWAYS PLAN FIRST. Make TODO list.
- CODE AFTER PLAN. 100% code blocks.
- ONLY CODE, PLAN, TODO, CAVEMAN GRUNTS. No explanations.

## RESPONSE FORMAT

1. PLAN. Short steps.
2. TODO LIST. Bullet tasks.
3. Full working code files.
4. Caveman grunt: "PLAN. TODO. CODE. DONE."

---

## Project Overview

IoT dashboard: ESP32 sensors → TimescaleDB (PostgreSQL) → Next.js frontend with real-time charts. Multi-tenant, role-based (admin/owner/viewer), alerts, maintenance, utilization tracking.

## Stack

- **Frontend**: Next.js 16 (App Router) + React 19 + Tailwind 4
- **Charts**: **uPlot** (canvas-based, replaced Recharts)
- **State**: Zustand (auth) + SWR (data fetching)
- **Forms**: react-hook-form
- **Theme**: next-themes (light/dark)
- **PDF/CSV export**: jsPDF + jspdf-autotable
- **Auth**: next-auth v5 (beta) + bcryptjs
- **DB driver**: `pg` (node-postgres)
- **HTTP**: axios
- **Time**: moment
- **Sensors**: `temperature`, `ph`, `salinity`, `dissolved_oxygen` only — NO humidity
- **Database**: PostgreSQL + TimescaleDB (Docker, `docker-compose.yml`)
- **Migrations**: 10 files in `/db/migrations/` (001 → 010)
- **ESP32**: `esp32_iotgateway.ino` — DO NOT change firmware

## Architecture

```
ESP32 Sensors
    │
    ▼ HTTP POST (Bearer token)
/api/send-sensor-data  ──→  TimescaleDB hypertable
                                │
                                ▼
                          Next.js Dashboard (SWR + uPlot)
```

## Database Tables

- `sensor_readings` — hypertable, partitioned by `time` (TIMESTAMPTZ)
- `owners` — users (admin/owner/viewer roles, bcrypt password_hash)
- `ponds` — pond metadata (pond_code `PND-001`..`PND-010`)
- `user_pond_access` — M:N user↔pond access
- `pond_sensor_thresholds` — per-pond optimal ranges per sensor
- `pond_sensor_thresholds_audit` — threshold change history
- `ingestion_logs` — every ESP32 POST (success + error)
- `sensor_alerts` — out-of-range alert events
- `maintenance_requests` — owner→admin maintenance tickets
- `pond_status_log` — periodic status snapshots for utilization

## API Routes

### Ingestion (Bearer token, no session)
- `POST /api/send-sensor-data` — ESP32 ingest endpoint

### Auth
- `GET|POST /api/auth/[...nextauth]` — next-auth handlers

### Dashboard data (session required)
- `GET /api/ponds` — ponds scoped to user
- `GET /api/ponds/status` — live status per pond (logs snapshot)
- `GET /api/dashboard/stats` — system health summary
- `GET /api/readings` — aggregated time-series (today/7d/14d/30d/1y)
- `GET /api/readings/latest?pond=N` — latest reading per pond
- `GET /api/readings/raw?sensor=X&pond=N` — raw points
- `GET /api/readings/all?ponds=&from=&to=` — multi-pond export rows

### Thresholds (session required)
- `GET /api/thresholds?pond=N`
- `PATCH /api/thresholds` — bulk upsert (writes audit)
- `GET /api/thresholds/history?pond=N&sensor=X`

### Alerts (session required)
- `GET /api/alerts` — full history (admin only)
- `GET /api/alerts/active` — unacknowledged
- `POST /api/alerts/[id]/acknowledge`

### Maintenance (session required)
- `GET /api/maintenance` — scoped to user
- `POST /api/maintenance` — owner/admin (viewer forbidden)
- `PATCH /api/maintenance/[id]` — admin only (acknowledge/resolve)

### Notifications (session required)
- `GET /api/notifications/unread-count`

### Utilization (session required)
- `GET /api/utilization?ponds=&from=&to=` — uptime % from `pond_status_log`

### Admin (admin role required via `requireAdmin()`)
- `GET|POST /api/admin/users`
- `PATCH|DELETE /api/admin/users/[id]`
- `GET|POST /api/admin/ponds`
- `PATCH|DELETE /api/admin/ponds/[id]`
- `GET /api/admin/ponds/next-code` — suggests next `PND-XXX`
- `GET /api/admin/logs` — ingestion logs (with CSV export)

## Pages

- `/` — redirect to `/dashboard` or `/login`
- `/login` — auth
- `/dashboard` — all-ponds overview
- `/dashboard/[pondId]` — per-pond detail
- `/dashboard/[pondId]/[sensorType]` — single sensor deep-dive
- `/reports` — export center (PDF / CSV)
- `/utilization` — utilization rate
- `/admin` — user & pond management
- `/admin/logs` — ingestion logs
- `/notifications` — maintenance requests + alerts
- `/settings/thresholds` — optimal range config

## Key Rules (LOAD-BEARING — DO NOT VIOLATE)

- **No humidity** anywhere — frontend, DB, payload. Removed permanently.
- **Frontend is complete** — do not modify unless task explicitly says so.
- **ESP32 firmware** (`esp32_iotgateway.ino`) — never change.
- **All timestamps UTC in DB** (TIMESTAMPTZ); convert to `APP_TIMEZONE` env var only for display.
- **Optimal ranges always from DB** (`pond_sensor_thresholds`) — never hardcode.
- **Pond status always from shared `getPondStatus()`** utility (`@/lib/pondStatus`) — never duplicate logic.
- **Round all sensor values to 2 decimals** — done in SQL via `ROUND(::numeric, 2)::float8`.
- **Alert re-triggers every 7 consecutive out-of-range readings** (migration 010).
- **Ingestion auth**: Bearer token from `API_TOKEN` env var.
- **Pond codes**: `PND-001` through `PND-010` (firmware sends `pnd: 1..10`).

## Conventions

- Env vars in `.env` — never commit
- Migrations in `/db/migrations/` — numbered, idempotent where possible
- DB pool: `@/lib/db` (singleton)
- Admin guard: `@/lib/admin` → `requireAdmin()`
- Session: next-auth via `@/auth`
- All API routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`

## ESP32 Payload Shape

```json
{ "data": { "pnd": 1, "rtd": 28.5, "ph": 7.2, "sal": 15.0, "dox": 6.8 } }
```

- `pnd` 1..10 → `PND-001`..`PND-010`
- `rtd` → temperature
- `dox` → dissolved_oxygen

## Documentation

Docs live in `/docs/` and exist in **two formats** — Markdown (GitHub-rendered) and Word (`.docx`):

- [User-Guide.md](docs/User-Guide.md) / `User-Guide.docx` — pond owners and viewers
- [Admin-Guide.md](docs/Admin-Guide.md) / `Admin-Guide.docx` — system administrators
- [Full-Documentation.md](docs/Full-Documentation.md) / `Full-Documentation.docx` — end-to-end system reference
- [Technical-Documentation.md](docs/Technical-Documentation.md) / `Technical-Documentation.docx` — developer handover
- [Database-Documentation.md](docs/Database-Documentation.md) / `Database-Documentation.docx` — schema, queries, backup

Doc source-of-truth is in `scripts/docs/*.js` (regenerates `.docx`). The `.md` files are hand-mirrored from those sources — when content changes, update **both** the JS source and the matching `.md`.
