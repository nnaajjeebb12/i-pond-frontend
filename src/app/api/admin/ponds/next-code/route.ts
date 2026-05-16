import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/ponds/next-code → { suggested: "PND-007" }
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { rows } = await pool.query<{ max_num: number | null }>(
    `SELECT MAX(NULLIF(regexp_replace(pond_code, '\\D', '', 'g'), '')::int) AS max_num
       FROM ponds
      WHERE pond_code ~ '^PND-\\d+$'`
  );
  const next = (rows[0]?.max_num ?? 0) + 1;
  const suggested = `PND-${String(next).padStart(3, "0")}`;
  return NextResponse.json({ suggested });
}
