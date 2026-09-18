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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.SYNC_TOKEN;

  if (!expected) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const readings = body?.readings;
  if (!Array.isArray(readings) || readings.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;
  let unknown = 0;

  // One lookup per distinct (owner_id, pond_code) per batch instead of one
  // per row — a batch is 500 rows across a handful of ponds.
  const pondCache = new Map<string, number | null>();

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

  try {
    for (const r of readings) {
      if (!r.owner_id || !r.pond_code || !r.time || !UUID_RE.test(r.owner_id)) {
        skipped++;
        continue;
      }

      const pondId = await resolvePond(r.owner_id, r.pond_code);
      if (pondId === null) {
        unknown++;
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
    }
  } catch (err) {
    console.error("sync_receiver_error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted, skipped, unknown });
}
