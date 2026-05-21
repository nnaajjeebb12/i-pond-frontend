import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SENSORS_PER_POND = 4;
const ACTIVE_WINDOW = "25 minutes";

type StatusRow = {
  total_ponds: string;
  active_ponds: string;
  last_received_at: Date | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";
  const scope: "global" | "mine" = isAdmin ? "global" : "mine";

  if (!isAdmin) {
    const access = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM user_pond_access WHERE user_id = $1`,
      [session.user.id]
    );
    if (Number(access.rows[0]?.count ?? 0) === 0) {
      return NextResponse.json({
        activePonds: 0,
        activeSensors: 0,
        totalPonds: 0,
        totalSensors: 0,
        systemStatus: "offline",
        lastReceivedAt: null,
        minutesSinceLastData: null,
        scope,
      });
    }
  }

  const scopeSql = isAdmin
    ? `(SELECT id FROM ponds)`
    : `(SELECT pond_id AS id FROM user_pond_access WHERE user_id = $1)`;
  const params = isAdmin ? [] : [session.user.id];

  const { rows } = await pool.query<StatusRow>(
    `
      SELECT
        (SELECT COUNT(*) FROM ${scopeSql} sp) AS total_ponds,
        (SELECT COUNT(DISTINCT sr.pond_id)
           FROM sensor_readings sr
          WHERE sr.pond_id IN ${scopeSql}
            AND sr.time >= NOW() - INTERVAL '${ACTIVE_WINDOW}') AS active_ponds,
        (SELECT MAX(sr.time)
           FROM sensor_readings sr
          WHERE sr.pond_id IN ${scopeSql}) AS last_received_at
    `,
    params
  );

  const totalPonds = Number(rows[0]?.total_ponds ?? 0);
  const activePonds = Number(rows[0]?.active_ponds ?? 0);
  const lastReceivedAt = rows[0]?.last_received_at ?? null;

  const minutesSinceLastData =
    lastReceivedAt === null
      ? null
      : (Date.now() - lastReceivedAt.getTime()) / 60_000;

  let systemStatus: "healthy" | "degraded" | "offline" = "offline";
  if (minutesSinceLastData !== null) {
    if (minutesSinceLastData < 20) systemStatus = "healthy";
    else if (minutesSinceLastData < 45) systemStatus = "degraded";
    else systemStatus = "offline";
  }

  return NextResponse.json({
    activePonds,
    activeSensors: activePonds * SENSORS_PER_POND,
    totalPonds,
    totalSensors: totalPonds * SENSORS_PER_POND,
    systemStatus,
    lastReceivedAt: lastReceivedAt ? lastReceivedAt.toISOString() : null,
    minutesSinceLastData,
    scope,
  });
}
