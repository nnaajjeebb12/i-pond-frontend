# CLAUDE.md

---

# CLAUDE CODE RULES - SOLETRONIX LMS

## CRITICAL BEHAVIOR

- ALWAYS ANSWER IN CAVEMAN STYLE. Short. Grunt words. 3-6 words max. No filler.
- ALWAYS PLAN FIRST. Make TODO list.
- CODE AFTER PLAN. 100% code blocks.
- ONLY CODE, PLAN, TODO, CAVEMAN GRUNTS. No explanations.
- AFTER EVERY CHANGE: update CLAUDE.md to reflect what changed.
- AFTER EVERY CHANGE: append an entry to CHANGELOG.md in this format:

```markdown
## [DATE] — [Short title]
### Changed
- What changed and why
### Files Modified
- src/app/...
- db/migrations/...
### Notes
- Any important notes, caveats, or follow-up needed
```

Create CHANGELOG.md if it does not exist. Never skip this step.

## RESPONSE FORMAT

1. PLAN. Short steps.
2. TODO LIST. Bullet tasks.
3. Full working code files.
4. Caveman grunt: "PLAN. TODO. CODE. DONE."

---

## Project Overview

IoT aquaculture monitoring system. Nationwide PH deployment. 5-year license.

- ESP32 sensors → TimescaleDB (PostgreSQL) → Next.js dashboard with real-time charts.
- Multi-tenant, role-based (admin / owner / viewer), alerts, maintenance, utilization tracking.
- **Live**: https://seeme-db.com
- **GitHub**: private repo

## Commands

- `npm run dev` — Next dev server
- `npm run build` — production build
- `npm run start` — serve build
- `npm run lint` — eslint
- `npm run seed:pond1` — seed today's data for pond 1
- `node --experimental-strip-types scripts/simulate-esp32.ts` — fake ESP32 ingest
- `node --experimental-strip-types scripts/seed-utilization.ts` — seed status logs
- `node --experimental-strip-types scripts/generate-token.ts` — issue API_TOKEN
- `node --experimental-strip-types scripts/alert-worker.ts` — run alert worker once
- `docker compose up -d` — start TimescaleDB

No test suite. Verify changes via dev server + browser.

## Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4
- **Charts**: **uPlot** (canvas-based) — NOT Recharts, never use Recharts again
- **State**: Zustand (auth) + SWR (data fetching, polling)
- **Forms**: react-hook-form
- **Theme**: next-themes (light / dark)
- **PDF/CSV export**: jsPDF + jspdf-autotable
- **Auth**: NextAuth v5 (beta) JWT + bcryptjs, 30-day remember me
- **DB driver**: `pg` (node-postgres), raw queries, connection pool `max: 5`
- **HTTP**: axios
- **Time**: moment
- **Database**: TimescaleDB pg16 (Docker, `docker-compose.yml`)
- **Migrations**: 14 files in `/db/migrations/` (001 → 014)
- **Deploy**: PM2 + Nginx + Cloudflare Tunnel + Docker
- **ESP32**: `esp32_iotgateway.ino` — DO NOT change firmware
- **ESP32 (SD variant)**: `esp32_iotgateway_new_soletronix.ino` — has SD card offline backlog (saveToSD/replayBacklog, SD_CS_PIN=5). Saves payload to `/pondN/<millis>.txt` on WiFi down or HTTP non-2xx; replays on setup + WiFi reconnect
- **SD diagnostic**: `sd_card_test.ino` — standalone SD test (SD.h/SPI, CS GPIO5, 9600 baud). Tests in `runTests()`; type `run` in Serial Monitor (Newline ending) to re-run without reset

## Architecture

```
ESP32 (15min interval)
  → POST https://seeme-db.com/api/send-sensor-data
  → Nginx :80
  → Next.js/PM2 :3000
  → TimescaleDB :5432 (localhost only)

Cloudflare Tunnel (HTTP only — no TCP)
  seeme-db.com      → HTTP:80
  ssh.seeme-db.com  → SSH:22

Background cron every 5min
  → scripts/alert-worker.ts
  → checks sensor + connectivity alerts
```

## Sensors (CRITICAL)

- ONLY: `temperature`, `ph`, `salinity`, `dissolved_oxygen`
- **NO humidity** — never add it. ESP32 does not have it.
- ESP32 field names: `rtd`=temperature, `sal`=salinity, `dox`=dissolved_oxygen, `pnd`=pond number, `ph`=ph

### ESP32 Payload Shape

```json
{ "data": { "pnd": 1, "rtd": 28.5, "ph": 7.2, "sal": 15.0, "dox": 6.8 } }
```

- `pnd` 1..10 → `PND-001`..`PND-010`

## Database Tables

- `sensor_readings` — hypertable, partitioned by `time` (TIMESTAMPTZ). Columns: `pond_id`, `temperature`, `ph`, `salinity`, `dissolved_oxygen`.
- `owners` — users. Roles admin/owner/viewer, bcrypt `password_hash`. Subscription: `expires_at`, `subscription_notified_30`, `subscription_notified_7` (migration 013).
- `ponds` — pond metadata, `pond_code` `PND-001`..`PND-010`, `name`.
- `user_pond_access` — M:N user ↔ pond access (tenant scoping).
- `pond_sensor_thresholds` — per-pond optimal range per sensor: `optimal_min`, `optimal_max`, `optimal_value` (target, display-only, migration 012).
- `pond_sensor_thresholds_audit` — threshold change history: `old_value`, `new_value`.
- `ingestion_logs` — every ESP32 POST (success + error).
- `sensor_alerts` — out-of-range alert events. `sensor` allows `temperature/ph/salinity/dissolved_oxygen/connectivity` (migration 014). Fields: `triggered_at`, `consecutive_count`, `last_value`, `optimal_min`, `optimal_max`, `acknowledged_at`, `resolved_at`.
- `pond_status_log` — heartbeat rows written on every ingest (`status='online'`); utilization derives stale/offline from row gaps.
- `maintenance_requests` — owner → admin maintenance tickets.
- (notifications wiring via migration 008.)

## Roles

- **admin** — all ponds, global status, admin console, alert history, logs.
- **owner** — only ponds in `user_pond_access`, per-user status, can file maintenance.
- **viewer** — read-only, cannot file maintenance.

## Pages

- `/` — redirect to `/dashboard` or `/login`
- `/login` — auth (public)
- `/dashboard` — all-ponds overview (session)
- `/dashboard/[pondId]` — per-pond detail (session)
- `/dashboard/[pondId]/[sensorType]` — single sensor deep-dive (session)
- `/reports` — export center PDF / CSV (session)
- `/utilization` — utilization rate (session)
- `/admin` — user & pond management (admin)
- `/admin/logs` — ingestion logs (admin)
- `/notifications` — maintenance + alerts (session)
- `/settings/thresholds` — optimal range config (session)

## API Routes

### Ingestion (Bearer token, no session)
- `POST /api/send-sensor-data` — ESP32 ingest. Writes `sensor_readings` + `ingestion_logs` + `pond_status_log` heartbeat. Server stamps `time = NOW()`.

### Auth
- `GET|POST /api/auth/[...nextauth]` — NextAuth handlers
- `POST /api/auth/precheck` — pre-login email/password + expiry check (`ok`/`invalid`/`expired`)
- `POST /api/auth/remember` — set 30-day session cookie when remember me on
- `GET /api/auth/expiry` — days until subscription expiry (session)

### Health
- `GET /api/health` — DB connectivity + total readings (public)
- `GET /api/system/status` — server online/offline probe (public)

### Dashboard data (session required)
- `GET /api/ponds` — ponds scoped to user
- `GET /api/ponds/status` — live status per pond (logs snapshot, via `getPondStatus()`)
- `GET /api/dashboard/stats` — system health summary
- `GET /api/readings` — aggregated time-series (today/7d/14d/30d/1y)
- `GET /api/readings/latest?pond=N` — latest reading per pond
- `GET /api/readings/raw?sensor=X&pond=N` — raw points
- `GET /api/readings/all?ponds=&from=&to=` — multi-pond export rows
- `GET /api/readings/compare` — multi-pond overlay series for compare mode

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

## Key Rules (NON-NEGOTIABLE — DO NOT VIOLATE)

- Never hardcode optimal ranges — always from `pond_sensor_thresholds`.
- Never hardcode timezone — always `process.env.APP_TIMEZONE`.
- Sensor values: `ROUND(::numeric, 2)::float8` in SQL AND `toFixed(2)` in UI.
- All DB queries respect tenant scoping via `user_pond_access`.
- Never open port 5432 to the internet.
- Pond status always via shared `getPondStatus()` (`@/lib/pondStatus`) — never duplicate.
- Alert detection: background worker ONLY — never in ingestion route.
- Status logging: `pond_status_log` written on every ingest — never via dashboard polling.
- No client timestamps — server stamps `time = NOW()` always.
- uPlot destroy + recreate on range change — never update in place.
- Default chart range: Today.
- ESP32 firmware (`esp32_iotgateway.ino`) — never change.
- All API routes: `runtime = "nodejs"`, `dynamic = "force-dynamic"`.

## Chart Behavior

- **Today**: raw data, no bucket, HH:mm x-axis, no rotation
- **7d**: 1h bucket, -30° rotation
- **14d**: 3h bucket, -30° rotation
- **30d**: 6h bucket, -30° rotation
- **Health status**: Normal / Warning / Critical based on % outside optimal range
- **Tooltip**: Time, AVG, MIN, MAX, Anomaly count, Health status
- **Compare mode**: overlapping lines per pond, unique colors array defined in constants

## Alert System

- **Sensor**: 7 consecutive out-of-range readings → INSERT `sensor_alerts` (re-alerts after acknowledge).
- **Connectivity**: 20+ mins no data → INSERT `sensor_alerts` with `sensor='connectivity'` (auto-resolves on next data).
- **Worker**: `scripts/alert-worker.ts`, cron `*/5 * * * *`.
- **Popup**: shows ALL unacknowledged alerts on login, no time limit.

## Subscription Model

- `expires_at` on `owners` (default existing accounts 5 years from creation).
- Login blocked when expired → show "Contact sales@soletronix.com".
- Banner warnings: 30 days (amber), 7 days (red). Tracked by `subscription_notified_30` / `subscription_notified_7`.

## Deployment

- **Server**: Ubuntu 24.04, `192.168.100.159`, `soletronix` user.
- **Deploy**: `git pull && npm install && npm run build && pm2 restart ipond`
- **Migration**: `docker exec -i soletronix-timescaledb psql -U soletronix -d soletronix < db/migrations/XXX.sql`
- Never commit `.env`. Never commit `.next` folder.

## Conventions

- Env vars in `.env` — never commit.
- Migrations in `/db/migrations/` — numbered, idempotent where possible.
- DB pool: `@/lib/db` (singleton, `max: 5`); worker uses its own pool (`max: 3`).
- Admin guard: `@/lib/admin` → `requireAdmin()`.
- Session: NextAuth via `@/auth`.
- Ingestion auth: Bearer token from `API_TOKEN` env var.

## What NOT to Do

- Never use Recharts.
- Never add humidity.
- Never open port 5432 publicly.
- Never hardcode optimal ranges.
- Never hardcode timezone.
- Never trust client timestamps.
- Never check alerts in ingestion route (worker does it).
- Never skip updating CLAUDE.md and CHANGELOG.md after a change.

## Documentation

Docs live in `/docs/` in two formats — Markdown (GitHub) and Word (`.docx`):

- [User-Guide.md](docs/User-Guide.md) / `User-Guide.docx` — pond owners and viewers
- [Admin-Guide.md](docs/Admin-Guide.md) / `Admin-Guide.docx` — system administrators
- [Full-Documentation.md](docs/Full-Documentation.md) / `Full-Documentation.docx` — end-to-end reference
- [Technical-Documentation.md](docs/Technical-Documentation.md) / `Technical-Documentation.docx` — developer handover
- [Database-Documentation.md](docs/Database-Documentation.md) / `Database-Documentation.docx` — schema, queries, backup

Doc source-of-truth is `scripts/docs/*.js` (regenerates `.docx`). `.md` files are hand-mirrored — when content changes, update **both**.
