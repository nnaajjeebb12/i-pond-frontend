import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = process.env.APP_TIMEZONE || "UTC";

const SENSOR_COLUMNS: Record<string, string> = {
  temperature: "temperature",
  ph: "ph",
  salinity: "salinity",
  dissolved_oxygen: "dissolved_oxygen",
  dox: "dissolved_oxygen",
};

type Range = "today" | "7d" | "14d" | "30d" | "1y";

const RANGE_BUCKETS: Record<Exclude<Range, "today">, { bucket: string; interval: string; label: string }> = {
  "7d": { bucket: "1 hour", interval: "7 days", label: "1 hour" },
  "14d": { bucket: "3 hours", interval: "14 days", label: "3 hours" },
  "30d": { bucket: "6 hours", interval: "30 days", label: "6 hours" },
  "1y": { bucket: "1 day", interval: "365 days", label: "1 day" },
};

function trendLabel(slope: number | null): "rising" | "falling" | "stable" {
  if (slope === null || !Number.isFinite(slope)) return "stable";
  if (slope > 0.001) return "rising";
  if (slope < -0.001) return "falling";
  return "stable";
}

async function ownsPond(userId: string, pondId: number): Promise<"yes" | "no" | "missing"> {
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM ponds WHERE id = $1 LIMIT 1`,
    [pondId]
  );
  if (existing.length === 0) return "missing";
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM user_pond_access WHERE user_id = $1 AND pond_id = $2 LIMIT 1`,
    [userId, pondId]
  );
  return rows.length > 0 ? "yes" : "no";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sensorParam = (url.searchParams.get("sensor") ?? "").toLowerCase();
  const rangeParam = (url.searchParams.get("range") ?? "7d").toLowerCase() as Range;
  const pondParam = url.searchParams.get("pond");
  const sinceParam = url.searchParams.get("since");

  const column = SENSOR_COLUMNS[sensorParam];
  if (!column) {
    return NextResponse.json({ error: "invalid_sensor" }, { status: 400 });
  }
  if (!["today", "7d", "14d", "30d", "1y"].includes(rangeParam)) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }

  let sinceMs: number | null = null;
  if (sinceParam !== null) {
    const n = Number(sinceParam);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "invalid_since" }, { status: 400 });
    }
    sinceMs = n;
  }

  const isAdmin = session.user.role === "admin";

  let pondId: number | null = null;
  if (pondParam !== null) {
    pondId = Number(pondParam);
    if (!Number.isFinite(pondId)) {
      return NextResponse.json({ error: "invalid_pond" }, { status: 400 });
    }
    if (!isAdmin) {
      const own = await ownsPond(session.user.id, pondId);
      if (own === "missing") return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (own === "no") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  try {
    // ---------- TODAY (raw) ----------
    if (rangeParam === "today") {
      if (pondId !== null) {
        const useSince = sinceMs !== null;
        const sql = useSince
          ? `SELECT time, ROUND(${column}::numeric, 2)::float8 AS value
               FROM sensor_readings
              WHERE pond_id = $1
                AND time > to_timestamp($2 / 1000.0)
              ORDER BY time ASC
              LIMIT 5000`
          : `SELECT time, ROUND(${column}::numeric, 2)::float8 AS value
               FROM sensor_readings
              WHERE pond_id = $1
                AND time >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
              ORDER BY time ASC
              LIMIT 5000`;
        const params = useSince ? [pondId, sinceMs] : [pondId, TZ];
        const { rows } = await pool.query<{ time: Date; value: number | null }>(sql, params);
        return NextResponse.json({
          mode: "raw",
          data: rows
            .filter((r) => r.value !== null)
            .map((r) => ({ time: r.time.getTime(), value: r.value as number })),
        });
      }

      // No pond: avg across visible ponds, 5-minute buckets for today.
      const sql = isAdmin
        ? `SELECT (time_bucket('15 minutes', time AT TIME ZONE $1) AT TIME ZONE $1) AS bucket,
                  ROUND(AVG(${column})::numeric, 2)::float8 AS value
             FROM sensor_readings
            WHERE time >= date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1
            GROUP BY bucket
            ORDER BY bucket ASC
            LIMIT 5000`
        : `SELECT (time_bucket('15 minutes', sr.time AT TIME ZONE $1) AT TIME ZONE $1) AS bucket,
                  AVG(sr.${column})::float8 AS value
             FROM sensor_readings sr
             JOIN user_pond_access upa ON upa.pond_id = sr.pond_id
            WHERE upa.user_id = $2
              AND sr.time >= date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1
            GROUP BY bucket
            ORDER BY bucket ASC
            LIMIT 5000`;
      const params = isAdmin ? [TZ] : [TZ, session.user.id];
      const { rows } = await pool.query<{ bucket: Date; value: number | null }>(sql, params);
      return NextResponse.json({
        mode: "raw",
        data: rows
          .filter((r) => r.value !== null)
          .map((r) => ({ time: r.bucket.getTime(), value: r.value as number })),
      });
    }

    // ---------- 7d / 14d / 30d / 1y (aggregated) ----------
    const cfg = RANGE_BUCKETS[rangeParam];

    if (pondId !== null) {
      const { rows } = await pool.query<{
        bucket: Date;
        avg: number | null;
        min: number | null;
        max: number | null;
        anomaly_count: string;
        trend_slope: number | null;
      }>(
        `SELECT
            (time_bucket($1::interval, sr.time AT TIME ZONE $5) AT TIME ZONE $5) AS bucket,
            ROUND(AVG(sr.${column})::numeric, 2)::float8 AS avg,
            ROUND(MIN(sr.${column})::numeric, 2)::float8 AS min,
            ROUND(MAX(sr.${column})::numeric, 2)::float8 AS max,
            COUNT(*) FILTER (
              WHERE sr.${column} < pst.optimal_min
                 OR sr.${column} > pst.optimal_max
            ) AS anomaly_count,
            REGR_SLOPE(sr.${column}, EXTRACT(EPOCH FROM sr.time)) AS trend_slope
           FROM sensor_readings sr
           LEFT JOIN pond_sensor_thresholds pst
             ON pst.pond_id = sr.pond_id
            AND pst.sensor  = $2
          WHERE sr.pond_id = $3
            AND sr.time >= NOW() - $4::interval
          GROUP BY bucket, pst.optimal_min, pst.optimal_max
          ORDER BY bucket ASC
          LIMIT 2000`,
        [cfg.bucket, column, pondId, cfg.interval, TZ]
      );

      return NextResponse.json({
        mode: "aggregated",
        bucketSize: cfg.label,
        data: rows
          .filter((r) => r.avg !== null)
          .map((r) => ({
            time: r.bucket.getTime(),
            avg: r.avg as number,
            min: r.min as number,
            max: r.max as number,
            anomalyCount: Number(r.anomaly_count),
            trend: trendLabel(r.trend_slope),
          })),
      });
    }

    // No pond: cross-pond average. Anomaly count uses each row's own pond threshold via JOIN.
    const sql = isAdmin
      ? `SELECT (time_bucket($1::interval, sr.time AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
                ROUND(AVG(sr.${column})::numeric, 2)::float8 AS avg,
                ROUND(MIN(sr.${column})::numeric, 2)::float8 AS min,
                ROUND(MAX(sr.${column})::numeric, 2)::float8 AS max,
                COUNT(*) FILTER (
                  WHERE sr.${column} < pst.optimal_min
                     OR sr.${column} > pst.optimal_max
                ) AS anomaly_count
           FROM sensor_readings sr
           LEFT JOIN pond_sensor_thresholds pst
             ON pst.pond_id = sr.pond_id
            AND pst.sensor  = $2
          WHERE sr.time >= NOW() - $3::interval
          GROUP BY bucket
          ORDER BY bucket ASC
          LIMIT 2000`
      : `SELECT (time_bucket($1::interval, sr.time AT TIME ZONE $5) AT TIME ZONE $5) AS bucket,
                ROUND(AVG(sr.${column})::numeric, 2)::float8 AS avg,
                ROUND(MIN(sr.${column})::numeric, 2)::float8 AS min,
                ROUND(MAX(sr.${column})::numeric, 2)::float8 AS max,
                COUNT(*) FILTER (
                  WHERE sr.${column} < pst.optimal_min
                     OR sr.${column} > pst.optimal_max
                ) AS anomaly_count
           FROM sensor_readings sr
           JOIN user_pond_access upa ON upa.pond_id = sr.pond_id
           LEFT JOIN pond_sensor_thresholds pst
             ON pst.pond_id = sr.pond_id
            AND pst.sensor  = $2
          WHERE upa.user_id = $3
            AND sr.time >= NOW() - $4::interval
          GROUP BY bucket
          ORDER BY bucket ASC
          LIMIT 2000`;
    const params = isAdmin
      ? [cfg.bucket, column, cfg.interval, TZ]
      : [cfg.bucket, column, session.user.id, cfg.interval, TZ];

    const { rows } = await pool.query<{
      bucket: Date;
      avg: number | null;
      min: number | null;
      max: number | null;
      anomaly_count: string;
    }>(sql, params);

    return NextResponse.json({
      mode: "aggregated",
      bucketSize: cfg.label,
      data: rows
        .filter((r) => r.avg !== null)
        .map((r) => ({
          time: r.bucket.getTime(),
          avg: r.avg as number,
          min: r.min as number,
          max: r.max as number,
          anomalyCount: Number(r.anomaly_count),
          trend: "stable" as const,
        })),
    });
  } catch (err) {
    console.error("readings_query_error", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
