-- 015_sync_receiver.sql
-- Make POST /api/sync (Raspberry Pi appliance receiver) work against the
-- live database. See MAIN-SERVER-HANDOVER.md §3.2 / §8.
--
-- 1. source column: 'esp32' for direct ingest, 'local-pi' for rows pushed by
--    an appliance. NULL for anything written before this migration.
-- 2. Unique index on (pond_id, time): the receiver's
--    ON CONFLICT (pond_id, time) DO NOTHING needs a unique arbiter. Without
--    it every sync batch fails with a Postgres error → 500 → the Pi never
--    marks anything as synced.
--
-- Idempotent. Dedupes existing (pond_id, time) collisions first, keeping the
-- physically-first row, otherwise the unique index build would fail.

ALTER TABLE sensor_readings
    ADD COLUMN IF NOT EXISTS source TEXT;

DELETE FROM sensor_readings a
 USING sensor_readings b
 WHERE a.pond_id = b.pond_id
   AND a.time = b.time
   AND a.ctid > b.ctid;

-- The live server already had a hand-made uq_sensor_readings_pond_time.
-- Only build ours when no unique (pond_id, time) index exists.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE tablename = 'sensor_readings'
           AND indexdef LIKE '%UNIQUE%'
           AND indexdef LIKE '%(pond_id, "time")%'
    ) THEN
        CREATE UNIQUE INDEX idx_sensor_readings_pond_time_unique
            ON sensor_readings (pond_id, time);
    END IF;
END $$;

-- pond_code stays globally unique (005_admin_management.sql). Direct ESP32
-- ingest resolves PND-### with no owner context, so per-owner codes would
-- make that path ambiguous. A second appliance site must use a distinct
-- PND range on the server.
