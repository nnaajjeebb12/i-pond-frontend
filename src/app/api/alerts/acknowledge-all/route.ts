import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Acknowledge every open alert the caller can see (same scoping as
// GET /api/alerts/active). Viewers are read-only.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isAdmin = session.user.role === "admin";

  const sql = isAdmin
    ? `UPDATE sensor_alerts
          SET acknowledged_at = NOW(),
              acknowledged_by = $1
        WHERE acknowledged_at IS NULL
          AND resolved_at IS NULL`
    : `UPDATE sensor_alerts a
          SET acknowledged_at = NOW(),
              acknowledged_by = $1
         FROM user_pond_access upa
        WHERE upa.pond_id = a.pond_id
          AND upa.user_id = $1
          AND a.acknowledged_at IS NULL
          AND a.resolved_at IS NULL`;

  const { rowCount } = await pool.query(sql, [session.user.id]);

  return NextResponse.json({ ok: true, acknowledged: rowCount ?? 0 });
}
