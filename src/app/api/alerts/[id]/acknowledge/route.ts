import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    const { rows } = await pool.query<{ pond_id: number }>(
      `SELECT pond_id FROM sensor_alerts WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { rows: access } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM user_pond_access
        WHERE user_id = $1 AND pond_id = $2 LIMIT 1`,
      [session.user.id, rows[0].pond_id]
    );
    if (access.length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  await pool.query(
    `UPDATE sensor_alerts
        SET acknowledged_at = NOW(),
            acknowledged_by = $2
      WHERE id = $1 AND acknowledged_at IS NULL`,
    [id, session.user.id]
  );

  return NextResponse.json({ ok: true });
}
