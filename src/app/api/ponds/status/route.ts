import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { getPondStatus } from "@/lib/pondStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const sql = isAdmin
    ? `SELECT p.id AS pond_id,
              MAX(sr.time) AS last_seen,
              EXISTS (
                SELECT 1 FROM maintenance_requests mr
                 WHERE mr.pond_id = p.id AND mr.status = 'pending'
              ) AS has_maintenance
         FROM ponds p
         LEFT JOIN sensor_readings sr ON sr.pond_id = p.id
          AND sr.time >= NOW() - INTERVAL '25 minutes'
        GROUP BY p.id
        ORDER BY p.id`
    : `SELECT p.id AS pond_id,
              MAX(sr.time) AS last_seen,
              EXISTS (
                SELECT 1 FROM maintenance_requests mr
                 WHERE mr.pond_id = p.id AND mr.status = 'pending'
              ) AS has_maintenance
         FROM ponds p
         JOIN user_pond_access upa ON upa.pond_id = p.id
         LEFT JOIN sensor_readings sr ON sr.pond_id = p.id
          AND sr.time >= NOW() - INTERVAL '25 minutes'
        WHERE upa.user_id = $1
        GROUP BY p.id
        ORDER BY p.id`;

  const { rows } = await pool.query<Row>(sql, isAdmin ? [] : [session.user.id]);

  const now = Date.now();
  const out = rows.map((r) => {
    const lastSeenMs = r.last_seen ? r.last_seen.getTime() : null;
    const minutes = lastSeenMs === null ? null : (now - lastSeenMs) / 60_000;
    const status = getPondStatus(lastSeenMs, r.has_maintenance, now);
    return {
      pondId: r.pond_id,
      status,
      hasMaintenance: r.has_maintenance,
      lastSeen: r.last_seen ? r.last_seen.toISOString() : null,
      minutesSinceLastData: minutes,
    };
  });

  // Status snapshots are recorded by the TimescaleDB job `record_pond_statuses`
  // (see db/migrations/011_status_logger_job.sql) every 30 seconds, regardless
  // of dashboard activity. Do not insert here.

  return NextResponse.json(out);
}
