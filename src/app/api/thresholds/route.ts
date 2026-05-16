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

type ThresholdRow = {
  id: string;
  pond_id: number;
  sensor: string;
  optimal_min: number;
  optimal_max: number;
  updated_at: Date;
  updated_by: string | null;
};

async function ownsPond(userId: string, pondId: number) {
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM ponds WHERE id = $1 LIMIT 1`,
    [pondId]
  );
  if (existing.length === 0) return "missing" as const;
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM user_pond_access WHERE user_id = $1 AND pond_id = $2 LIMIT 1`,
    [userId, pondId]
  );
  return rows.length > 0 ? ("yes" as const) : ("no" as const);
}

// ---------- GET /api/thresholds?pond=1 ----------

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pondParam = new URL(req.url).searchParams.get("pond");
  if (pondParam === null) {
    return NextResponse.json({ error: "missing_pond" }, { status: 400 });
  }
  const pondId = Number(pondParam);
  if (!Number.isFinite(pondId)) {
    return NextResponse.json({ error: "invalid_pond" }, { status: 400 });
  }

  if (session.user.role !== "admin") {
    const own = await ownsPond(session.user.id, pondId);
    if (own === "missing") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (own === "no") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { rows } = await pool.query<ThresholdRow>(
    `SELECT id, pond_id, sensor, optimal_min, optimal_max, updated_at, updated_by
       FROM pond_sensor_thresholds
      WHERE pond_id = $1
      ORDER BY sensor`,
    [pondId]
  );

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      pondId: r.pond_id,
      sensor: r.sensor,
      optimal_min: r.optimal_min,
      optimal_max: r.optimal_max,
      updated_at: r.updated_at.toISOString(),
      updated_by: r.updated_by,
    }))
  );
}

// ---------- PATCH /api/thresholds ----------

type PatchBody = {
  ponds?: unknown;
  sensor?: unknown;
  optimal_min?: unknown;
  optimal_max?: unknown;
};

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sensor = String(body.sensor ?? "");
  const optMin = Number(body.optimal_min);
  const optMax = Number(body.optimal_max);
  const pondsRaw = body.ponds;

  if (!VALID_SENSORS.has(sensor)) {
    return NextResponse.json({ error: "invalid_sensor" }, { status: 400 });
  }
  if (!Number.isFinite(optMin) || !Number.isFinite(optMax)) {
    return NextResponse.json({ error: "invalid_bounds" }, { status: 400 });
  }
  if (optMin >= optMax) {
    return NextResponse.json({ error: "min_must_be_less_than_max" }, { status: 400 });
  }
  if (!Array.isArray(pondsRaw) || pondsRaw.length === 0) {
    return NextResponse.json({ error: "ponds_required" }, { status: 400 });
  }

  const pondIds: number[] = [];
  for (const p of pondsRaw) {
    const n = Number(p);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ error: "invalid_pond_id" }, { status: 400 });
    }
    pondIds.push(Math.trunc(n));
  }

  // Authorize: admin OK for any; non-admin must have access to every pond.
  if (session.user.role !== "admin") {
    const { rows: ownRows } = await pool.query<{ pond_id: number }>(
      `SELECT pond_id FROM user_pond_access
        WHERE user_id = $1 AND pond_id = ANY($2::int[])`,
      [session.user.id, pondIds]
    );
    const owned = new Set(ownRows.map((r) => r.pond_id));
    const denied = pondIds.filter((id) => !owned.has(id));
    if (denied.length > 0) {
      return NextResponse.json(
        { error: "forbidden", ponds: denied },
        { status: 403 }
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated: ThresholdRow[] = [];
    for (const pondId of pondIds) {
      const { rows: cur } = await client.query<{
        optimal_min: number | null;
        optimal_max: number | null;
      }>(
        `SELECT optimal_min, optimal_max
           FROM pond_sensor_thresholds
          WHERE pond_id = $1 AND sensor = $2`,
        [pondId, sensor]
      );
      const oldMin = cur[0]?.optimal_min ?? null;
      const oldMax = cur[0]?.optimal_max ?? null;

      await client.query(
        `INSERT INTO pond_sensor_thresholds_audit
            (pond_id, sensor, old_min, old_max, new_min, new_max, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pondId, sensor, oldMin, oldMax, optMin, optMax, session.user.id]
      );

      const { rows: upserted } = await client.query<ThresholdRow>(
        `INSERT INTO pond_sensor_thresholds
            (pond_id, sensor, optimal_min, optimal_max, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (pond_id, sensor) DO UPDATE SET
            optimal_min = EXCLUDED.optimal_min,
            optimal_max = EXCLUDED.optimal_max,
            updated_at  = EXCLUDED.updated_at,
            updated_by  = EXCLUDED.updated_by
         RETURNING id, pond_id, sensor, optimal_min, optimal_max, updated_at, updated_by`,
        [pondId, sensor, optMin, optMax, session.user.id]
      );
      updated.push(upserted[0]);
    }

    await client.query("COMMIT");

    return NextResponse.json({
      updated: updated.map((r) => ({
        id: r.id,
        pondId: r.pond_id,
        sensor: r.sensor,
        optimal_min: r.optimal_min,
        optimal_max: r.optimal_max,
        updated_at: r.updated_at.toISOString(),
        updated_by: r.updated_by,
      })),
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("thresholds_patch_error", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
