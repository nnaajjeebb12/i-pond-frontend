import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  for (const r of readings) {
    if (!r.owner_id || !r.pond_code || !r.time) {
      skipped++;
      continue;
    }

    const pondRes = await pool.query(
      `SELECT id FROM ponds WHERE owner_id = $1 AND pond_code = $2`,
      [r.owner_id, r.pond_code]
    );

    if (pondRes.rowCount === 0) {
      skipped++;
      continue;
    }

    const pondId = pondRes.rows[0].id;

    await pool.query(
      `INSERT INTO sensor_readings (time, pond_id, temperature, ph, salinity, dissolved_oxygen)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (pond_id, time) DO NOTHING`,
      [r.time, pondId, r.temperature, r.ph, r.salinity, r.dissolved_oxygen]
    );
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, skipped });
}
