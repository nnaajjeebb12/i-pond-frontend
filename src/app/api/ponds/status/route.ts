import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { getPondStatus } from "@/lib/pondStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Must equal REALERT_COOLDOWN in scripts/alert-worker.ts.
const REALERT_COOLDOWN = "24 hours";

type Row = {
  pond_id: number;
  last_seen: Date | null;
  has_maintenance: boolean;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";

  // True last reading per pond (index-only via idx_sensor_readings_pond_time),
  // not "last reading in the past 25 minutes" — so minutesSinceLastData is
  // real and a pond offline for an hour is distinguishable from one that has
  // never sent anything.
  const sql = isAdmin
    ? `SELECT p.id AS pond_id,
              sr.time AS last_seen,
              EXISTS (
                SELECT 1 FROM maintenance_requests mr
                 WHERE mr.pond_id = p.id AND mr.status = 'pending'
              ) AS has_maintenance
         FROM ponds p
         LEFT JOIN LATERAL (
           SELECT time FROM sensor_readings
            WHERE pond_id = p.id
            ORDER BY time DESC
            LIMIT 1
         ) sr ON TRUE
        ORDER BY p.id`
    : `SELECT p.id AS pond_id,
              sr.time AS last_seen,
              EXISTS (
                SELECT 1 FROM maintenance_requests mr
                 WHERE mr.pond_id = p.id AND mr.status = 'pending'
              ) AS has_maintenance
         FROM ponds p
         JOIN user_pond_access upa ON upa.pond_id = p.id
         LEFT JOIN LATERAL (
           SELECT time FROM sensor_readings
            WHERE pond_id = p.id
            ORDER BY time DESC
            LIMIT 1
         ) sr ON TRUE
        WHERE upa.user_id = $1
        ORDER BY p.id`;

  const { rows } = await pool.query<Row>(sql, isAdmin ? [] : [session.user.id]);

  const now = Date.now();
  const offline: { pondId: number; minutes: number }[] = [];
  const out = rows.map((r) => {
    const lastSeenMs = r.last_seen ? r.last_seen.getTime() : null;
    const minutes = lastSeenMs === null ? null : (now - lastSeenMs) / 60_000;
    const status = getPondStatus(lastSeenMs, r.has_maintenance, now);
    // Ponds that have never sent a reading are shown offline but not alerted
    // on — otherwise every seeded-but-unwired pond is a permanent alert.
    if (status === "offline" && !r.has_maintenance && minutes !== null) {
      offline.push({ pondId: r.pond_id, minutes });
    }
    return {
      pondId: r.pond_id,
      status,
      hasMaintenance: r.has_maintenance,
      lastSeen: r.last_seen ? r.last_seen.toISOString() : null,
      minutesSinceLastData: minutes,
    };
  });

  // Raise a connectivity alert for each offline pond that does not already
  // have one open or acknowledged inside the cooldown. There is NO unique
  // index on sensor_alerts (migration 010 dropped it so sensor alerts can
  // re-fire after acknowledgement), so ON CONFLICT catches nothing — every
  // insert into sensor_alerts must guard with NOT EXISTS. Same rule as
  // mayRaise() in scripts/alert-worker.ts.
  if (offline.length > 0) {
    try {
      await pool.query(
        `INSERT INTO sensor_alerts
           (pond_id, sensor, triggered_at, consecutive_count, last_value, optimal_min, optimal_max)
         SELECT o.pond_id, 'connectivity', NOW(), 1, o.minutes, 0, 0
           FROM UNNEST($1::int[], $2::float8[]) AS o(pond_id, minutes)
          WHERE NOT EXISTS (
                  SELECT 1 FROM sensor_alerts a
                   WHERE a.pond_id = o.pond_id
                     AND a.sensor = 'connectivity'
                     AND ((a.acknowledged_at IS NULL AND a.resolved_at IS NULL)
                          OR a.acknowledged_at > NOW() - $3::interval)
                )`,
        [offline.map((o) => o.pondId), offline.map((o) => o.minutes), REALERT_COOLDOWN]
      );
    } catch (err) {
      console.error("connectivity_alert_insert_error", err);
    }
  }

  return NextResponse.json(out);
}
