# Handover: what the local appliance did, and what the main server needs to know

**For:** Claude Code working in the main-server repo (`nnaajjeebb12/i-pond-frontend`, live at https://seeme-db.com).
**From:** the local-appliance repo (`ipond-local`, the Raspberry Pi build).
**Date:** 2026-09-18.

## 0. Read this first

There are two repos that started as the same code:

| | Main server (you) | Local appliance (this handover's source) |
|---|---|---|
| Repo | `nnaajjeebb12/i-pond-frontend` | `ipond-local/i-pond-frontend` (fork of your **b0c3b75** "sync: latest server changes") |
| Runs on | seeme-db.com, PM2 + Nginx + Cloudflare Tunnel, multi-tenant, NextAuth | One Raspberry Pi per customer site, LAN only, no login, signed licence file |
| Data in | ESP32 gateways over Wi-Fi/HTTP **and** Pi appliances via `POST /api/sync` | ESP32 gateway over **USB serial** → `scripts/serial-listener.js` → `/api/send-sensor-data` |
| Migrations | 001 → 014 | 001 → 019 (015–019 are appliance-only, see §7) |

**Nothing in the main-server repo or on the live server was changed while the appliance was built.** The appliance was deliberately designed around what seeme-db.com already exposes (`POST /api/sync`, the NextAuth credentials login, `GET /api/ponds`, `GET /api/health`). That was a hard rule on the appliance side ("never add code that requires a new route, column or migration on the main server").

This document tells you:

1. the exact surfaces the Pi depends on, which must stay stable (§2);
2. what has to be true **in the live database** per site for sync to work — data, not code (§3);
3. two structural mismatches in your data model that the appliance had to work around and that you should decide on (§4);
4. bugs the appliance work found that **also exist in your code at b0c3b75**, with the fixes (§5);
5. improvements made on the appliance that are worth porting (§6), and things that must **not** be ported (§7).

A local copy of your repo at b0c3b75 lives at `ipond-local/cloned main/i-pond-frontend` (gitignored, reference only). Every "your file" reference below was checked against that copy. If the live repo has moved past b0c3b75, re-check before acting.

## 1. What the appliance is, in one screen

- Same Next.js 15 / React 19 / TimescaleDB stack, same four sensors (`temperature`, `ph`, `salinity`, `dissolved_oxygen` — still no humidity), same ESP32 payload `{"data":{"pnd","rtd","ph","sal","dox"}}`.
- **No auth.** NextAuth, roles, `user_pond_access`, the admin console, the login page and the subscription/expiry columns are gone. The only gate is `src/lib/license.ts`: an RSA-SHA256 signed `license.json` bound to the Pi's `/proc/cpuinfo` serial. Every query returns every pond.
- **No maintenance requests** (nobody at Soletronix would see one filed on a Pi). The table stays, unused.
- **Readings are kept forever locally** and **pushed to you** by `scripts/sync-worker.ts` (cron `*/5`), 500 per batch, max 20 batches per run. Rows are marked `synced_at` **only after your receiver confirms them**.
- **Owner = the customer's login account on your server.** The Pi learns it by running your NextAuth credentials flow with the customer's email + password (once, never stored) and reading `/api/auth/session` + `/api/ponds`. Offline fallback: an admin types the owner UUID by hand.
- One fixed local admin credential (`soletronix` / `Soletronix@pi2026`, in source) guards only two destructive actions: changing the cloud owner and deleting a pond that has readings. It is not your auth and never talks to you.
- Performance work for the Pi: a 15-minute continuous aggregate (`sensor_readings_15m`) that every chart reads, compression after 30 days, ingest in one `synchronous_commit=off` transaction, heartbeat rows throttled to 1/pond/minute.
- Firmware: the USB-serial gateway sketch was rewritten with a byte-level `{…}` capture (see §5.3) — the `readString()` version hung after the first reading.

## 2. The contract the Pi depends on — keep these stable

If any of these change, every deployed Pi stops syncing or stops being able to sign in. The Pi has no auto-update path; a field visit is what a breaking change costs.

### 2.1 `POST /api/sync` (your `src/app/api/sync/route.ts`, b0c3b75)

The Pi carries a **verbatim copy** of your route at `ipond-local/i-pond-frontend/src/app/api/sync/route.ts` and the worker is written to its exact behaviour:

- Header `Authorization: Bearer $SYNC_TOKEN`. 401 otherwise. `SYNC_TOKEN` must be set in your env or the route answers 500 `server_misconfigured`.
- Body: `{ "readings": [ { time, owner_id, pond_code, temperature, ph, salinity, dissolved_oxygen, source: "local-pi" } ] }`, never empty (400 `invalid_payload`).
- `time` is a **full-precision ISO string with microseconds** (`to_char(time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`, e.g. `2026-09-18T00:00:00.975346Z`). You pass it straight to `$1` → `::timestamptz`. **Never round it through a JS `Date`** — milliseconds only, and then `ON CONFLICT` no longer matches re-sends and the Pi can never reconcile.
- Per row: `SELECT id FROM ponds WHERE owner_id = $1 AND pond_code = $2`; found → `INSERT … ON CONFLICT (pond_id, time) DO NOTHING`, `inserted++`; not found → `skipped++`.
- Response `{ ok: true, inserted, skipped }`. The Pi reads it as:
  - `inserted` = "on the server now" (**duplicates are counted as inserted** — the counter ticks even when `ON CONFLICT` drops the row; the Pi relies on a re-send being a free no-op).
  - `skipped` = "NOT on the server". Because you do not say *which* rows, on `skipped > 0` the Pi re-sends **one reading per pond code** in the batch as a probe, learns which codes you lack, marks only the others, and excludes the unknown codes for the rest of the run. One missing pond delays only that pond.
  - If you ever add an **`unknown`** field (rows whose `(owner_id, pond_code)` did not resolve), the Pi already prefers it over `skipped`. That is the one receiver change that would make the probe round-trips unnecessary. `ipond-local/…/src/lib/sync.ts` `postBatch` is the client side.
- `middleware.ts` must keep `/api/sync` (and `/api/health`, `/api/send-sensor-data`) in the login-exempt matcher. It does at b0c3b75.
- The `source` field is sent but your INSERT ignores it. If you add the column (`ALTER TABLE sensor_readings ADD COLUMN source TEXT`), writing it lets you tell Pi-synced rows from direct ESP32 ingest. Optional.

### 2.2 Sign-in flow (your NextAuth setup, driven by `ipond-local/…/src/lib/cloudAccount.ts`)

1. `GET /api/auth/csrf` → `{ csrfToken }` + csrf cookie
2. `POST /api/auth/callback/credentials` (form-encoded `csrfToken`, `email`, `password`, `callbackUrl`, `redirect: manual`) → session cookie
3. `GET /api/auth/session` → `{ user: { id, name, email, role } }` — **success is judged only by this returning a user**, not by where step 2 redirected.
4. `GET /api/ponds` with the session cookie → JSON array of `{ id, pond_code, name, location, capacity, area, company_name }`.

The Pi needs `user.id` (= `ponds.owner_id` it will sync under), `user.name`, `user.role`. It refuses `viewer` accounts (they cannot own ponds) and for `admin` accounts sets the owner but skips the pond import (your `/api/ponds` returns every site's ponds to an admin). If you upgrade Auth.js, rename cookies, add 2FA or change the session JSON, `cloudSignIn` is the one place on the Pi to fix — but fixing it means re-deploying every Pi.

### 2.3 `GET /api/health`

Used as the reachability probe (3 s timeout from the UI, 8 s from the worker). Must stay unauthenticated and cheap.

## 3. What must be true in the live database, per customer site

These are **data**, not code. Neither is in your migrations. If sync has ever worked from a Pi against the live server, both are already true there; verify before assuming.

### 3.1 Every pond the Pi will sync must have `ponds.owner_id` = that site's owner UUID

Your receiver matches on `ponds.owner_id`. Your admin console's create route (`src/app/api/admin/ponds/route.ts:108`) inserts `(pond_code, name, location, company_name, capacity, area)` and **leaves `owner_id` NULL**; access is granted through `user_pond_access` instead. A pond created that way is visible to the owner in the dashboard but **invisible to the sync receiver** — the Pi reports it as "not found under this owner on the main server" and holds its readings.

Per pond, today:

```sql
UPDATE ponds SET owner_id = '<owner uuid>' WHERE pond_code = 'PND-0NN';
```

Find the gaps:

```sql
SELECT p.pond_code, p.name, upa.user_id AS has_access_for, p.owner_id
  FROM ponds p
  LEFT JOIN user_pond_access upa ON upa.pond_id = p.id
 WHERE p.owner_id IS NULL;
```

See §4.1 for the structural fix.

### 3.2 A unique index on `sensor_readings (pond_id, time)` must exist

Your receiver's `ON CONFLICT (pond_id, time) DO NOTHING` needs a unique index or constraint as its arbiter. Your migrations create only a plain index (`001_init.sql:24`, `002_multitenancy.sql:50`). Without the unique one, **every batch fails with a Postgres error → 500 → the Pi shows `server_error` and never marks anything**.

```sql
-- fails if duplicates already exist; dedupe first
CREATE UNIQUE INDEX IF NOT EXISTS idx_sensor_readings_pond_time_unique
    ON sensor_readings (pond_id, time);
```

Check: `\d sensor_readings` should list it. The appliance's `db/migrations/016_sync.sql` is written to be applied on both sides (adds `synced_at`, `source`, the unique index and a partial index on unsynced rows; the unused half is harmless).

### 3.3 `SYNC_TOKEN` in the server env

Deliberately **not** the same value as `API_TOKEN`: a leaked ESP32 token must not be able to bulk-write history, and a leaked sync token must not be able to pose as a sensor. Each Pi carries the same `SYNC_TOKEN` in its `.env`.

## 4. Structural mismatches to decide on

The appliance worked around both. They are your call, but they will bite every new site.

### 4.1 Two ownership models on the main server

- Dashboard / `/api/ponds` / `/api/readings`: **`user_pond_access`** (M2M, the model since migration 005).
- Sync receiver: **`ponds.owner_id`** (the legacy single-owner column, nullable since 005).

They can disagree, and the admin console makes them disagree by default (§3.1). Options, cheapest first:

1. Keep both, and make the admin console's pond create/assign also set `owner_id` when exactly one owner is assigned. Data-only fix per site meanwhile (§3.1).
2. Change the receiver to resolve `(owner_id, pond_code)` through `user_pond_access` (`JOIN user_pond_access upa ON upa.pond_id = p.id WHERE upa.user_id = $1 AND p.pond_code = $2`). Then a pond shared with two accounts syncs under either — decide whether that is wanted. The Pi's contract is unchanged by this.

### 4.2 `pond_code` is globally unique on the main server, but every Pi numbers from `PND-001`

`005_admin_management.sql:23` — `CREATE UNIQUE INDEX idx_ponds_pond_code ON ponds (pond_code) WHERE pond_code IS NOT NULL`. Site-wide, not per owner.

On the Pi, the gateway's `pnd` number maps to `PND-001`…`PND-9999` and "+ Add Pond" auto-numbers from the next free `PND-###`. Sync identifies a pond as `(owner_id, pond_code)`. So **the second customer site cannot have a `PND-001` on your server**, and the first site's Pi will happily create `PND-001` locally and then wait forever for you to have one under the second owner.

Options:

1. Make the index `UNIQUE (owner_id, pond_code)` (partial on `pond_code IS NOT NULL`). Then codes are per site, which is what the wire contract already assumes. Check `/api/admin/ponds` still 409s on a duplicate **within** an owner.
2. Keep global codes and give each site a distinct range (site A `PND-001…010`, site B `PND-011…020`). Then the Pi's `pnd → PND-###` mapping must be offset per site, which the appliance does **not** support today, and the ESP32 sensor board's `pnd` would have to be reprogrammed per site. The appliance's cloud-connect import (`POST /api/settings/cloud-connect`, "main server wins") would pull site B's `PND-011…` down to the Pi, but the gateway would still post `pnd: 1` → `PND-001`.

Option 1 is the one the appliance was built for.

## 5. Bugs found on the appliance that are also in your code at b0c3b75

Each was reproduced and fixed on the appliance; the fixed file is named so you can diff rather than re-derive.

### 5.1 `/api/ponds/status` inserts a new connectivity alert on every poll

**Your** `src/app/api/ponds/status/route.ts:69-81`: the comment says the partial unique index prevents duplicates and `ON CONFLICT DO NOTHING` makes the insert idempotent. **Migration 010 dropped that index on purpose** (`010_alerts_retrigger.sql:4`, so sensor alerts re-fire after acknowledgement), so `ON CONFLICT` conflicts on nothing and **every dashboard load and every 30 s poll mints one fresh connectivity alert per offline pond**. On the appliance this was 52 open alerts after a few page loads; on a real site with one gateway down it is hundreds per hour.

Fix (appliance `src/app/api/ponds/status/route.ts:75-83`): guard with `WHERE NOT EXISTS (SELECT 1 FROM sensor_alerts a WHERE a.pond_id = p.id AND a.sensor = 'connectivity' AND (a.acknowledged_at IS NULL OR a.acknowledged_at > NOW() - $3::interval))` — the same `mayRaise` guard the alert worker uses, with a 24 h re-alert cooldown. Also record the real offline gap instead of the hardcoded `0` (the popup said "0 minutes").

Rule to carry over: **any code that inserts a `sensor_alerts` row must guard with `NOT EXISTS`; there is no unique index to catch it.**

### 5.2 `/api/readings/compare?range=today` returns 500

**Your** `src/app/api/readings/compare/route.ts:93-123`: the today SQL references `$1`, `$2`, `$4` but not `$3`, while `params` passes four values. Postgres: `could not determine data type of parameter $3`. `today` is the dashboard's default range, so compare mode is broken on first load. Fix: drop `cfg.interval` from the today params (appliance `src/app/api/readings/compare/route.ts`).

### 5.3 ESP32 gateway "sends once per reset"

**Your** `esp32_iotgateway_new_soletronix.ino:315` and `esp32_iotgateway_new_soletronix_Serial.ino:315` both do `String val = Serial2.readString();`. `readString()` returns only after 1 s of silence on the line; a sensor board that sends with shorter gaps never lets it return, so the gateway hangs inside it after the first reading. It also parses the whole buffer, so any byte before the `{` fails the read. The Wi-Fi/SD build's ~12 s cycle happened to mask this; the serial build exposed it in the field.

Fix (appliance `esp32_iotgateway_new_soletronix_Serial/esp32_iotgateway_new_soletronix_Serial.ino`, `loop()` lines 113-220): read `Serial2` one byte at a time, capture from `{` to the matching `}`, never block, ignore what precedes the brace, flush the RX buffer after the 5 s LCD hold, drop messages over 240 bytes. Diagnostics go out as `# …` lines so they never look like data. The LCD layout, 5 s hold and `rtc.read()` are unchanged. Compiled in Arduino IDE (264 KB flash, ArduinoJson 7 `JsonDocument`). Apply the same reader to the Wi-Fi sketch if any direct-to-cloud gateway shows the symptom. `esp32_iotgateway_old_code_working.ino` is the untouched reference.

### 5.4 Ingest rejects `pnd > 10`

**Your** `src/app/api/send-sensor-data/route.ts:140` caps `pnd` at 10. The appliance accepts 1–9999 and resolves `PND-###`; unknown codes still 404. Only matters if a site has more than ten ponds.

### 5.5 Postgres runs stock defaults, and 5432 is open to the world

**Your** `docker-compose.yml`:

- `./db/migrations:/docker-entrypoint-initdb.d:ro` **replaces** the directory where the TimescaleDB image keeps its `timescaledb-tune` step, so the container has always run stock Postgres defaults (128 MB `shared_buffers`, fsync on every commit, `random_page_cost=4`). The appliance passes tuning in `command:` (see its `docker-compose.yml`: `shared_buffers`, `effective_cache_size`, `synchronous_commit=off` — accepted for telemetry —, 15-min checkpoints, `max_wal_size=2GB`, `wal_compression=on`, `random_page_cost=1.1`, `log_checkpoints=on`). Scale the memory numbers to the server.
- `ports: "5432:5432"` binds on every interface. Use `"127.0.0.1:5432:5432"` unless something off-box genuinely needs it.

### 5.6 Alerts come back the moment they are acknowledged

Beyond 5.1: your alert worker re-checks the *condition* every 5 min and inserts a new row for a sensor still out of range or a pond still offline, so acknowledging buys five minutes of quiet and the popup is effectively un-dismissable. Appliance fix (`scripts/alert-worker.ts` `mayRaise`, `REALERT_COOLDOWN = '24 hours'`, mirrored in the status route): don't re-raise the same pond + sensor while an alert is open **or was acknowledged inside the cooldown**. Keep the two constants equal.

### 5.7 Chart queries scan raw readings

Your `/api/readings` and `/api/readings/compare` `GROUP BY` over every raw row in range, `LIMIT 5000`, polled every 10 s for four sensors in **both** view modes at once (the dashboard called `useMultiPondReadings` and `useCompareReadings` unconditionally — 8 queries per tick, 4 never shown). At 1 Hz ingest `LIMIT 5000` silently stops Today at ~01:20. On the appliance this was the whole "Pi is very slow" story; on the main server it is the same cost multiplied by tenants. See §6.1.

## 6. Improvements worth porting (optional, in rough order of value)

### 6.1 15-minute continuous aggregate + compression (appliance migrations 017, 018, `src/lib/rollup.ts`)

`sensor_readings_15m`: per pond per 15 min, `n` plus `<sensor>_sum/_cnt/_min/_max` (sum+count so 1 h / 3 h / 6 h / 1 d buckets re-aggregate exactly). Real-time aggregation on, refresh every 5 min. Measured: compare-today 363 ms → 10 ms, 7d 483 ms → 3 ms, identical results. Every chart reads it except Today-for-one-pond (1-minute averages from raw, ≤1440 points, `since` re-sends the last bucket). Compression of chunks older than 30 days, `segmentby pond_id`: 3.9 MB → 224 kB per test chunk; rows in compressed chunks are still readable and upsertable.

Two traps found while doing it: `GROUP BY bucket` on the rollup resolves to the view's own `bucket` column, not the alias — the query "works" at 15-minute resolution for every range. **Use positional `GROUP BY 1`.** And anomaly count moves to 15-minute resolution (a bucket whose average is out of range counts all its readings) — that is the rule the health colour already used, so tooltip and colour finally agree.

Also: poll only the visible view mode (`active` flag on both hooks), `/api/ponds` every 60 s not 10 s.

### 6.2 Ingest as one transaction (appliance `src/app/api/send-sensor-data/route.ts`)

`BEGIN; SET LOCAL synchronous_commit TO off;` reading + ingestion log + heartbeat; `COMMIT`. Was three autocommit inserts = three WAL fsyncs per reading with every dashboard query queued behind them. Heartbeat rows (`pond_status_log`) throttled to one per pond per 60 s — utilization's finest distinction is a 20-minute gap, so per-reading heartbeats were 60x the writes for no information.

### 6.3 Alert rules (appliance `scripts/alert-worker.ts`, `src/app/api/ponds/status/route.ts`, `AlertPopup.tsx`, `useAlerts.ts`)

- Sensor rule: every reading in the last **30 minutes** out of range, minimum 7 readings (`SENSOR_WINDOW_MINUTES`, `SENSOR_MIN_READINGS`). "Last 7 readings" is under a minute at gateway cadence. Auto-resolves (`resolved_at`) on the first in-range reading.
- Ponds that have never sent a reading are not alerted on (still shown offline). Ten seeded ponds and one gateway = nine permanent alerts otherwise.
- `/api/ponds/status` reads the true last reading per pond (`LEFT JOIN LATERAL (… ORDER BY time DESC LIMIT 1)`, index-only) instead of "last reading in the past 25 minutes", so `minutesSinceLastData` is real and a pond offline for an hour is distinguishable from a never-seen one.
- Popup: **Acknowledge** (server) and **Ignore** (this browser only); "Ignore all" / "Acknowledge all"; `POST /api/alerts/acknowledge-all`; per-row acknowledge on `/notifications`. Suppression is per `pondId:sensor` in `sessionStorage`, not per alert id (a re-raised row has a new id). Optimistic: card disappears on click, request and refetches in the background, failure brings it back with the reason. Anything that acknowledges must also revalidate the unread-count SWR key.
- Failed writes are surfaced in the UI, not just `console.error` — "loads then nothing happens" was a 500 nobody could see.

### 6.4 Small things

- `POST /api/ponds` + "+ Add Pond" on the dashboard (auto-numbers under a table lock; 409 `pond_code_taken`). On your side this is the admin console's job, but the lock idea applies.
- `GET`/`DELETE /api/ponds/[id]` with counts, typed confirmation and a refresh of the continuous aggregate afterwards (its policy only looks back 3 days; otherwise a deleted pond leaves ghost buckets in all-pond charts).
- `scripts/latest.js` (`npm run latest [-- --watch N]`): read-only "what is in the database right now" — last reading per pond and its age, today's count, pending sync, open alerts, last ingest error. First thing to run for "nothing is coming in".
- `ipond_prune_logs` TimescaleDB job: `ingestion_logs` 30 days, `pond_status_log` 120 days. `sensor_readings` never pruned.
- `db/run_remaining.sh` lives in `db/`, **not** `db/migrations/` — the Postgres entrypoint executes any `*.sh` it finds in the init directory. Check you don't have one there.
- `getOperatorId()` self-heals when `owners` is empty — appliance-only problem, but the symptom (every acknowledge / threshold write 500s on a FK to a missing row, UI shows nothing) is worth knowing.

## 7. Do NOT port — appliance-only by design

| Appliance change | Why it stays on the Pi |
|---|---|
| Licence gate (`src/lib/license.ts`, `LicenseExpired`, `LicenseBanner`, `/api/license`) | Replaces auth on a single-tenant box. You have accounts and (had) subscriptions. |
| Removal of NextAuth, roles, `user_pond_access`, admin console, login page | Your multi-tenancy. |
| Migration 015 (drops `owners.expires_at`, `subscription_notified_*`) | Your subscription model. |
| Migration 019 `app_settings` (`sync_owner_id`, `sync_owner_name`) | Pi-side runtime config. |
| `src/lib/adminSession.ts`, `/api/admin/login|logout|session` | Fixed local credential for a trusted LAN. Never on the internet. |
| `src/lib/cloudAccount.ts`, `POST /api/settings/cloud-connect`, `/settings/appliance` | Client of **your** login; nothing to add on your side. |
| `src/lib/sync.ts`, `scripts/sync-worker.ts`, `/api/sync/status`, `/api/sync/trigger`, `SyncStatus.tsx` | The sender. You are the receiver. |
| `scripts/serial-listener.js`, `ipond-serial` systemd unit | USB gateway plumbing. |
| Maintenance-request removal | Requests belong on your server, where Soletronix sees them. |
| `next.config.ts` `output: "standalone"`, `scripts/deploy.sh`, `vercel.json` deletion | Pi packaging. You deploy with PM2. |
| `db/seeds/002_local_appliance.sql` | Single-operator seed. (Your `001_seed.sql` assigns ponds to owners it never creates and fails on a fresh DB — worth a look, but it's your seed.) |
| Pi-Deployment-Checklist.md, the Pi tuning numbers | Hardware-specific. |

Also not on your side: the two "reference" endpoints `/api/sync/owner` and `/api/sync/ponds` that an earlier appliance iteration proposed adding to the main server. They were **removed** from the appliance once the sign-in path replaced them. Don't resurrect them.

## 8. If the "never change the main server" rule is relaxed

Only two receiver changes would help the Pi, both backward compatible:

1. Add `unknown` to the `/api/sync` response = rows whose `(owner_id, pond_code)` did not resolve. The Pi prefers it over `skipped` and would stop probing.
2. Write `source` (`'local-pi'`) on insert, after adding the column, so you can tell synced rows from direct ingest.

Everything else the Pi needs is data (§3) or your own bug fixes (§5).

## 9. How to verify from your side

```bash
# receiver is up and authenticated (expect 400 invalid_payload, not 401/404/redirect)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://seeme-db.com/api/sync \
  -H "Authorization: Bearer $SYNC_TOKEN" -H 'Content-Type: application/json' -d '{"readings":[]}'

# one real row for a site (expect {"ok":true,"inserted":1,"skipped":0}; skipped:1 = §3.1)
curl -s -X POST https://seeme-db.com/api/sync \
  -H "Authorization: Bearer $SYNC_TOKEN" -H 'Content-Type: application/json' \
  -d '{"readings":[{"time":"2026-09-18T00:00:00.000001Z","owner_id":"<uuid>","pond_code":"PND-001","temperature":28.5,"ph":7.2,"salinity":15,"dissolved_oxygen":6.8,"source":"local-pi"}]}'
# a 500 here = §3.2 (no unique index)
```

```sql
-- the unique index the receiver needs
SELECT indexname FROM pg_indexes WHERE tablename = 'sensor_readings' AND indexdef LIKE '%UNIQUE%';
-- ponds a Pi could never sync
SELECT pond_code, name FROM ponds WHERE owner_id IS NULL AND pond_code IS NOT NULL;
-- alert spam check (5.1): run twice a minute apart while a pond is offline; count must not climb
SELECT count(*) FROM sensor_alerts WHERE sensor = 'connectivity' AND acknowledged_at IS NULL;
```

On the Pi side, the sidebar's sync status and `npm run latest` report `pending`, `last sync`, and the names of any pond codes you lack.

## 10. Where to look in the appliance repo

| Topic | File(s) in `ipond-local/i-pond-frontend/` |
|---|---|
| The rules and every design decision | `CLAUDE.md` (long; sections *Cloud Sync*, *Alert System*, *Key Rules*) |
| Dated history of each change with verification notes | `CHANGELOG.md` (2026-09-08 → 2026-09-16) |
| Sync client | `src/lib/sync.ts`, `scripts/sync-worker.ts` |
| Your receiver, mirrored verbatim | `src/app/api/sync/route.ts` |
| Sign-in against your server | `src/lib/cloudAccount.ts`, `src/app/api/settings/cloud-connect/route.ts` |
| Migrations you may want | `db/migrations/016_sync.sql`, `017_continuous_aggregate.sql`, `018_compression.sql` |
| Rollup SQL fragments | `src/lib/rollup.ts` |
| Chart routes on the rollup | `src/app/api/readings/route.ts`, `src/app/api/readings/compare/route.ts` |
| Alert worker / status route | `scripts/alert-worker.ts`, `src/app/api/ponds/status/route.ts` |
| Popup / notifications | `src/components/AlertPopup.tsx`, `src/hooks/useAlerts.ts`, `src/app/notifications/page.tsx` |
| Ingest transaction | `src/app/api/send-sensor-data/route.ts` |
| Fixed gateway firmware | `esp32_iotgateway_new_soletronix_Serial/esp32_iotgateway_new_soletronix_Serial.ino` |
| Postgres tuning | `docker-compose.yml` (`command:` block) |
| Diagnostics | `scripts/latest.js` |
