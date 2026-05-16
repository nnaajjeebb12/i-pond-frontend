import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SENSORS = new Set([
  "temperature",
  "ph",
  "salinity",
  "dissolved_oxygen",
]);

type AuditRow = {
  id: string;
  pond_id: number;
  sensor: string;
  old_min: number | null;
  old_max: number | null;
  new_min: number;
  new_max: number;
  changed_at: Date;
  changed_by: string | null;
  changed_by_name: string | null;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const pondParam = url.searchParams.get("pond");
  const sensor = String(url.searchParams.get("sensor") ?? "");

  if (pondParam === null) {
    return NextResponse.json({ error: "missing_pond" }, { status: 400 });
  }
  const pondId = Number(pondParam);
  if (!Number.isFinite(pondId)) {
    return NextResponse.json({ error: "invalid_pond" }, { status: 400 });
  }
  if (!VALID_SENSORS.has(sensor)) {
    return NextResponse.json({ error: "invalid_sensor" }, { status: 400 });
  }

  if (session.user.role !== "admin") {
    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM ponds WHERE id = $1 LIMIT 1`,
      [pondId]
    );
    if (existing.length === 0)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM user_pond_access WHERE user_id = $1 AND pond_id = $2 LIMIT 1`,
      [session.user.id, pondId]
    );
    if (rows.length === 0)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { rows } = await pool.query<AuditRow>(
    `SELECT a.id, a.pond_id, a.sensor, a.old_min, a.old_max, a.new_min, a.new_max,
            a.changed_at, a.changed_by, o.name AS changed_by_name
       FROM pond_sensor_thresholds_audit a
       LEFT JOIN owners o ON o.id = a.changed_by
      WHERE a.pond_id = $1 AND a.sensor = $2
      ORDER BY a.changed_at DESC
      LIMIT 200`,
    [pondId, sensor]
  );

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      pondId: r.pond_id,
      sensor: r.sensor,
      old_min: r.old_min,
      old_max: r.old_max,
      new_min: r.new_min,
      new_max: r.new_max,
      changed_at: r.changed_at.toISOString(),
      changed_by: r.changed_by,
      changed_by_name: r.changed_by_name,
    }))
  );
}
