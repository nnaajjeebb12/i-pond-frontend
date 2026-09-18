# Changelog

## [2026-09-18] — Pi appliance handover: sync receiver, alert fixes, Acknowledge/Ignore all
### Changed
- Migration 015: `sensor_readings.source` column + UNIQUE index `(pond_id, time)` (dedupes first). Without the unique index every `/api/sync` batch 500'd on `ON CONFLICT`.
- `/api/sync`: resolves pond via `user_pond_access` instead of legacy `ponds.owner_id` (admin console never sets `owner_id`, so admin-created ponds were invisible to sync). Adds `unknown` count to response, writes `source`, caches pond lookups per batch, 500 on DB error instead of crashing mid-batch.
- `/api/send-sensor-data`: writes `source='esp32'`; `pnd` cap 10 → 9999.
- `/api/ponds/status`: was minting a new connectivity alert on every 30 s poll (`ON CONFLICT DO NOTHING` with no unique index since migration 010). Now `NOT EXISTS` guard + 24 h re-alert cooldown, records real offline gap (was hardcoded 0 → popup said "0 minutes"), true last reading via LATERAL, never-seen ponds not alerted.
- `/api/readings/compare?range=today` returned 500 (`could not determine data type of parameter $3` — 4 params passed, SQL used $1/$2/$4). Renumbered to 3 params.
- `scripts/alert-worker.ts`: `mayRaise()` guard — no re-raise while open or acknowledged within `REALERT_COOLDOWN='24 hours'` (was re-raising 5 min after acknowledge). Sensor alerts now auto-resolve on first in-range reading. Never-seen ponds skipped.
- Alert popup: per-row **Ignore** (browser session, `sessionStorage` keyed `pondId:sensor`), header **Ignore all** / **Acknowledge all**. Optimistic hide, failure restores card and shows reason inline. New `POST /api/alerts/acknowledge-all`. Acknowledge revalidates unread-count badge.
- `docker-compose.yml`: 5432 bound to `127.0.0.1`; Postgres tuning via `command:` (init-dir mount disables `timescaledb-tune`, container was on stock defaults).
- `.env.example`: `SYNC_TOKEN` documented.
- Firmware: root `esp32_iotgateway_new_soletronix_Serial.ino` (blocking `readString()`, sent once per reset) replaced by fixed `esp32_iotgateway_new_soletronix_Serial/` folder version (byte-level `{…}` capture).
### Files Modified
- db/migrations/015_sync_receiver.sql (new)
- src/app/api/sync/route.ts
- src/app/api/send-sensor-data/route.ts
- src/app/api/ponds/status/route.ts
- src/app/api/readings/compare/route.ts
- src/app/api/alerts/acknowledge-all/route.ts (new)
- src/hooks/useAlerts.ts
- src/components/AlertPopup.tsx
- scripts/alert-worker.ts
- docker-compose.yml
- .env.example
- esp32_iotgateway_new_soletronix_Serial/esp32_iotgateway_new_soletronix_Serial.ino (new), esp32_iotgateway_new_soletronix_Serial.ino (deleted)
- CLAUDE.md, MAIN-SERVER-HANDOVER.md (new, reference)
### Notes
- **Server steps**: (1) set `SYNC_TOKEN` in `.env` (≠ `API_TOKEN`); (2) apply migration 015 — fails if the dedupe can't run, check output; (3) `docker compose up -d` to pick up tuning + port bind (restarts DB, ~seconds downtime); (4) `npm run build && pm2 restart ipond`.
- `pond_code` stays globally unique (handover §4.2 option 1 NOT taken): direct ESP32 ingest resolves `PND-###` with no owner context. Second Pi site needs a distinct PND range on the server.
- Migration not tested locally (no Docker on this machine). Verify on server with `\d sensor_readings` → `idx_sensor_readings_pond_time_unique`.
- Not ported from handover §6: 15-min continuous aggregate, ingest transaction, heartbeat throttle, `scripts/latest.js`, per-row ack on `/notifications`.

## [2026-07-18] — Mirror LCD output to Serial (new gateway firmware)
### Changed
- lcdLine() now Serial.println() every non-empty message as "[LCD Ln] msg"
- lcdShow() unchanged (mirrors via lcdLine); empty lines skipped by length check
- printToLCD() adds "=== SENSOR DATA ===" block to Serial (temp/pH/sal/dox/pond)
- No LCD calls removed, no logic changed
### Files Modified
- esp32_iotgateway_new_soletronix.ino
### Notes
- For running with LCD disconnected — all UI now visible in Serial Monitor (9600 baud)

## [2026-07-18] — SD card backlog in new gateway firmware
### Changed
- Added SD card offline backlog to esp32_iotgateway_new_soletronix.ino (separate from production esp32_iotgateway.ino)
- SD init + pond1..5 dir creation in setup(); sdAvailable flag
- saveToSD(): writes payload to /pondN/<millis>.txt on WiFi down OR HTTP non-2xx
- replayBacklog(): re-POSTs stored files, removes on 2xx; runs on setup (if WiFi) and on WiFi reconnect in loop()
- Payload saved to SD uses identical format to sendToServer() body
- LCD feedback for all SD ops
### Files Modified
- esp32_iotgateway_new_soletronix.ino
### Notes
- SD_CS_PIN = 5 (matches sd_card_test.ino wiring)
- Production firmware esp32_iotgateway.ino unchanged
- IDE "cannot open SD.h/SPI.h" diagnostic is expected (Arduino libs not on VSCode include path)

## [2026-07-18] — SD test re-run via Serial command
### Changed
- Refactored all 7 tests into runTests()
- setup() calls runTests() once; loop() waits for 'run' command to re-run (no reset needed)
- Unknown commands echoed back with hint
### Files Modified
- sd_card_test.ino
### Notes
- Serial Monitor: line ending = Newline, baud = 9600 (matches firmware; NOT 115200)
- Test logic, SD library, CS pin unchanged

## [2026-07-18] — Add SD card test sketch
### Changed
- New standalone Arduino sketch to diagnose SD card via Serial Monitor
- Mirrors old firmware SD setup: SD.h over SPI, default VSPI CS (GPIO5), 9600 baud
- 7 tests in setup(): init, write, read, recursive list, create pond dirs, simulate backlog save, cleanup
### Files Modified
- sd_card_test.ino (new)
### Notes
- Baud is 9600 to match esp32_iotgateway_old_code_working.ino (NOT 115200)
- CS_PIN 5 = ESP32 default VSPI CS; old code used bare SD.begin()
- Test 6 uses millis()-based filename + {"data":{...}} payload shape
- Firmware files are diagnostics only; production ESP32 firmware unchanged

## [2026-05-19] — Initial production state
### System
- App deployed on Ubuntu Server 24.04 at office
- Cloudflare Tunnel (seeme-db.com) HTTP routing
- TimescaleDB in Docker
- PM2 + Nginx
- Background alert worker cron every 5 mins
### Features Complete
- Dashboard with pond cards, sensor trends, system overview
- Per-pond and per-sensor charts (uPlot)
- Reports (PDF/CSV, date range, export all)
- Utilization page
- Notifications (alerts + maintenance)
- Threshold settings with audit log
- Admin console (user/pond CRUD)
- Ingestion logs
- Dark/light mode
- Remember me (30 days)
- Subscription/expiry model
- Sensor health status (Normal/Warning/Critical)
- Pond multi-select filter + compare mode
- Background alert worker (sensor + connectivity)
### Database
- 13 migrations applied
- 10 tables including hypertable, audit, subscription columns

## [2026-06-08] — Rewrite CLAUDE.md + add changelog rule
### Changed
- Rewrote CLAUDE.md to match current production state (live at seeme-db.com, 5-year nationwide PH license)
- Added CRITICAL rule: update CLAUDE.md + append CHANGELOG.md after every change
- Updated stack: NextAuth v5 JWT 30-day remember me, pg pool max:5, uPlot (never Recharts)
- Documented all 14 migrations, 10 tables, all current pages and API routes
- Added new routes: auth/precheck, auth/remember, auth/expiry, health, system/status, readings/compare
- Documented alert worker (sensor + connectivity), subscription model, deployment, chart behavior
### Files Modified
- CLAUDE.md
- CHANGELOG.md (created)
### Notes
- CRITICAL BEHAVIOR + RESPONSE FORMAT sections preserved verbatim, changelog rule appended
- Migration files now 001→014 (was documented as 010); 011 deprecates old status-logger job; 012 adds optimal_value; 013 subscription; 014 connectivity alerts
