import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";

  if (isAdmin) {
    const { rows } = await pool.query<{
      maintenance: string;
      alerts: string;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM maintenance_requests WHERE status = 'pending') AS maintenance,
         (SELECT COUNT(*) FROM sensor_alerts
            WHERE resolved_at IS NULL AND acknowledged_at IS NULL) AS alerts`
    );
    const maintenance = Number(rows[0]?.maintenance ?? 0);
    const alerts = Number(rows[0]?.alerts ?? 0);
    return NextResponse.json({
      total: maintenance + alerts,
      maintenance,
      alerts,
    });
  }

  const { rows } = await pool.query<{ maintenance: string }>(
    `SELECT COUNT(*) AS maintenance
       FROM maintenance_requests m
       JOIN user_pond_access upa ON upa.pond_id = m.pond_id
      WHERE upa.user_id = $1
        AND m.status IN ('pending', 'acknowledged')`,
    [session.user.id]
  );
  const maintenance = Number(rows[0]?.maintenance ?? 0);
  return NextResponse.json({ total: maintenance, maintenance, alerts: 0 });
}
