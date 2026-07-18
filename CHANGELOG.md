# Changelog

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
