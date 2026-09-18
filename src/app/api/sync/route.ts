import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Receiver for Raspberry Pi appliances (scripts/sync-worker.ts on the Pi).
// Wire contract is frozen — see MAIN-SERVER-HANDOVER.md §2.1:
//   - Authorization: Bearer $SYNC_TOKEN (distinct from API_TOKEN)
//   - body { readings: [{ time, owner_id, pond_code, temperature, ph,
//                        salinity, dissolved_oxygen, source }] }
//   - `time` is a full-precision ISO string; pass straight to ::timestamptz,
//     never round through a JS Date or ON CONFLICT stops matching re-sends
//   - response { ok, inserted, skipped, unknown }
//       inserted = on the server now (duplicates count as inserted)
//       skipped  = rows missing owner_id / pond_code / time
//       unknown  = rows whose (owner_id, pond_code) did not resolve
//     The Pi prefers `unknown` over `skipped` when present.
//
// Pond resolution goes through user_pond_access (the dashboard's ownership
// model), not the legacy ponds.owner_id column — the admin console never
// sets owner_id, so matching on it made every admin-created pond invisible
// to sync.
//
// Visibility: one ingestion_logs row per pond per batch (not per reading —
// a batch is 500 rows). raw_payload carries a summary with source
// 'local-pi' and the batch's time span; the sensor columns hold the newest
// reading in the batch for that pond so /admin/logs shows live values.

type IncomingReading = {
  time: string;
  owner_id?: string;
  pond_code?: string;
  temperature: number | null;
  ph: number | null;
  salinity: number | null;
  dissolved_oxygen: number | null;
  source?: string;
};

type Payload = {
  readings?: IncomingReading[];
};

type PondBatch = {
  pondId: number | null;
  pondCode: string;
  ownerId: string;
  rows: number;
  inserted: number;
  firstTime: string;
  lastTime: string;
  latest: IncomingReading;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function writeLog(args: {
  pondId: number | null;
  pondCode: string | null;
  rawPayload: unknown;
  latest?: IncomingReading | null;
  httpStatus: number;
  ip: string;
  errorMessage: string | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO ingestion_logs
         (pond_id, pond_code, raw_payload,
          temperature, ph, salinity, dissolved_oxygen,
          http_status, ip_address, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        args.pondId,
        args.pondCode,
        JSON.stringify(args.rawPayload ?? {}),
        args.latest?.temperature ?? null,
        args.latest?.ph ?? null,
        args.latest?.salinity ?? null,
        args.latest?.dissolved_oxygen ?? null,
        args.httpStatus,
        args.ip,
        args.errorMessage,
      ]
    );
  } catch (err) {
    console.error("sync_log_write_error", err);
  }
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.SYNC_TOKEN;

  if (!expected) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    await writeLog({
      pondId: null,
      pondCode: null,
      rawPayload: { source: "local-pi" },
      httpStatus: 401,
      ip,
      errorMessage: "sync_unauthorized",
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    await writeLog({
      pondId: null,
      pondCode: null,
      rawPayload: { source: "local-pi" },
      httpStatus: 400,
      ip,
      errorMessage: "sync_invalid_json",
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const readings = body?.readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    await writeLog({
      pondId: null,
      pondCode: null,
      rawPayload: { source: "local-pi", readings: readings ?? null },
      httpStatus: 400,
      ip,
      errorMessage: "sync_invalid_payload",
    });
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;
  let unknown = 0;

  // One lookup per distinct (owner_id, pond_code) per batch instead of one
  // per row — a batch is 500 rows across a handful of ponds.
  const pondCache = new Map<string, number | null>();
  const batches = new Map<string, PondBatch>();

  async function resolvePond(ownerId: string, pondCode: string) {
    const key = `${ownerId}|${pondCode}`;
    if (pondCache.has(key)) return pondCache.get(key) ?? null;

    const { rows } = await pool.query<{ id: number }>(
      `SELECT p.id
         FROM ponds p
         JOIN user_pond_access upa ON upa.pond_id = p.id
        WHERE upa.user_id = $1 AND p.pond_code = $2
        LIMIT 1`,
      [ownerId, pondCode]
    );
    const id = rows[0]?.id ?? null;
    pondCache.set(key, id);
    return id;
  }

  function track(r: IncomingReading, pondId: number | null, didInsert: boolean) {
    const key = `${r.owner_id}|${r.pond_code}`;
    const b = batches.get(key);
    if (!b) {
      batches.set(key, {
        pondId,
        pondCode: r.pond_code as string,
        ownerId: r.owner_id as string,
        rows: 1,
        inserted: didInsert ? 1 : 0,
        firstTime: r.time,
        lastTime: r.time,
        latest: r,
      });
      return;
    }
    b.rows++;
    if (didInsert) b.inserted++;
    if (r.time < b.firstTime) b.firstTime = r.time;
    if (r.time > b.lastTime) {
      b.lastTime = r.time;
      b.latest = r;
    }
  }

  try {
    for (const r of readings) {
      if (!r.owner_id || !r.pond_code || !r.time || !UUID_RE.test(r.owner_id)) {
        skipped++;
        continue;
      }

      const pondId = await resolvePond(r.owner_id, r.pond_code);
      if (pondId === null) {
        unknown++;
        track(r, null, false);
        continue;
      }

      await pool.query(
        `INSERT INTO sensor_readings
           (time, pond_id, temperature, ph, salinity, dissolved_oxygen, source)
         VALUES ($1::timestamptz, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (pond_id, time) DO NOTHING`,
        [
          r.time,
          pondId,
          r.temperature,
          r.ph,
          r.salinity,
          r.dissolved_oxygen,
          r.source ?? "local-pi",
        ]
      );
      inserted++;
      track(r, pondId, true);
    }
  } catch (err) {
    console.error("sync_receiver_error", err);
    await writeLog({
      pondId: null,
      pondCode: null,
      rawPayload: { source: "local-pi", rows: readings.length },
      httpStatus: 500,
      ip,
      errorMessage: `sync_server_error: ${(err as Error).message}`,
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  for (const b of batches.values()) {
    await writeLog({
      pondId: b.pondId,
      pondCode: b.pondCode,
      rawPayload: {
        source: "local-pi",
        owner_id: b.ownerId,
        pond_code: b.pondCode,
        rows: b.rows,
        inserted: b.inserted,
        from: b.firstTime,
        to: b.lastTime,
        latest: b.latest,
      },
      latest: b.latest,
      httpStatus: 200,
      ip,
      errorMessage: b.pondId === null ? "sync_unknown_pond" : null,
    });
  }

  return NextResponse.json({ ok: true, inserted, skipped, unknown });
}
