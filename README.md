# Soletronix iPond — IoT Aquaculture Monitoring System

## What is this?

Soletronix iPond is a real-time IoT monitoring platform for aquaculture ponds. ESP32 gateways stream temperature, pH, salinity, and dissolved oxygen readings into a TimescaleDB hypertable, which a Next.js dashboard visualizes through canvas-based uPlot charts, role-scoped views, threshold-driven alerts, maintenance workflows, and PDF/CSV exports. The system is multi-tenant: a single administrator manages ponds and users; owners and viewers see only the ponds assigned to them.

## Tech Stack

- **Frontend** — Next.js 16 (App Router), React 19, Tailwind CSS 4, next-themes (light/dark)
- **Charts** — uPlot (canvas-based, replaces Recharts)
- **State / Data** — Zustand (auth), SWR (polling and revalidation), react-hook-form (forms)
- **Auth** — next-auth v5 (beta) with credentials provider, bcryptjs for hashing
- **Database** — PostgreSQL 16 + TimescaleDB (hypertable on `sensor_readings`), `pg` (node-postgres)
- **Export** — jsPDF + jspdf-autotable (PDF), native CSV
- **HTTP / Time** — axios, moment
- **Hardware** — ESP32 gateway (firmware `esp32_iotgateway.ino`), Bearer-token ingest

## Quick Start

1. **Install dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```
2. **Start the database**
   ```bash
   docker compose up -d
   ```
   TimescaleDB picks up migrations from `db/migrations/` on first run.
3. **Configure environment** — see the table below and create `.env` at the project root.
4. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and sign in. Use `/admin` to seed users and assign ponds.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (e.g. `postgres://user:pass@localhost:5432/ipond`). |
| `POSTGRES_USER` | Yes | Database superuser, consumed by `docker-compose.yml`. |
| `POSTGRES_PASSWORD` | Yes | Database password, consumed by `docker-compose.yml`. |
| `POSTGRES_DB` | Yes | Database name, consumed by `docker-compose.yml`. |
| `API_TOKEN` | Yes | Bearer token the ESP32 must send to `POST /api/send-sensor-data`. |
| `AUTH_SECRET` | Yes | next-auth JWT signing secret. Generate with `openssl rand -base64 32`. |
| `APP_TIMEZONE` | No | IANA timezone used for "Today" buckets in `/api/readings` (default `UTC`). |
| `NEXTAUTH_URL` | No | Base URL for next-auth in production (e.g. `https://ipond.example.com`). |
| `NODE_ENV` | No | `development` or `production`. |

## Project Structure

```
i-pond-frontend/
├── db/
│   └── migrations/          # Numbered SQL (001 → 011), idempotent
├── docs/                    # User, Admin, Full, Technical, Database guides (.md + .docx)
├── docker-compose.yml       # TimescaleDB service
├── esp32_iotgateway.ino     # ESP32 firmware (do not modify from app side)
├── scripts/                 # Simulators, seed scripts, docx generators
├── src/
│   ├── app/                 # Next.js App Router pages + API routes
│   │   ├── api/             # Route handlers (auth, readings, admin, etc.)
│   │   ├── admin/           # /admin and /admin/logs
│   │   ├── dashboard/       # All-ponds, per-pond, per-sensor views
│   │   ├── notifications/   # Maintenance requests + alerts
│   │   ├── reports/         # PDF / CSV export center
│   │   ├── settings/        # Threshold configuration
│   │   ├── utilization/     # Uptime utilization
│   │   └── login/
│   ├── auth.ts              # next-auth v5 configuration
│   ├── auth.config.ts       # Edge-safe auth options + middleware callback
│   ├── components/          # SensorCard, AlertPopup, charts/, MainLayout
│   ├── hooks/               # useApi, useAlerts, useMaintenance, useThresholds, useDashboardStats, useSystemHealth
│   ├── lib/                 # db pool, admin guard, alert checker, pondStatus
│   └── store/               # Zustand auth store
└── public/
```

## Documentation

Each guide is available in two formats: a GitHub-friendly Markdown version (renders inline) and a polished `.docx` version (for printing and offline reading).

| Guide | Audience | Markdown | Word |
|---|---|---|---|
| User Guide | Pond owners and viewers | [docs/User-Guide.md](docs/User-Guide.md) | [docs/User-Guide.docx](docs/User-Guide.docx) |
| Admin Guide | System administrators | [docs/Admin-Guide.md](docs/Admin-Guide.md) | [docs/Admin-Guide.docx](docs/Admin-Guide.docx) |
| Full Documentation | End-to-end system reference | [docs/Full-Documentation.md](docs/Full-Documentation.md) | [docs/Full-Documentation.docx](docs/Full-Documentation.docx) |
| Technical Documentation | Developer handover | [docs/Technical-Documentation.md](docs/Technical-Documentation.md) | [docs/Technical-Documentation.docx](docs/Technical-Documentation.docx) |
| Database Documentation | Schema, queries, backup | [docs/Database-Documentation.md](docs/Database-Documentation.md) | [docs/Database-Documentation.docx](docs/Database-Documentation.docx) |
