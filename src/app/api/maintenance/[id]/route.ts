import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { status?: unknown; adminNote?: unknown };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const status = String(body.status ?? "");
  if (status !== "acknowledged" && status !== "resolved") {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }
  const adminNote =
    body.adminNote === undefined || body.adminNote === null
      ? null
      : String(body.adminNote);

  const sql =
    status === "acknowledged"
      ? `UPDATE maintenance_requests
            SET status = 'acknowledged',
                acknowledged_at = NOW(),
                acknowledged_by = $2,
                admin_note = COALESCE($3, admin_note)
          WHERE id = $1
          RETURNING id, status`
      : `UPDATE maintenance_requests
            SET status = 'resolved',
                resolved_at = NOW(),
                resolved_by = $2,
                admin_note = COALESCE($3, admin_note),
                acknowledged_at = COALESCE(acknowledged_at, NOW()),
                acknowledged_by = COALESCE(acknowledged_by, $2)
          WHERE id = $1
          RETURNING id, status`;

  const { rows } = await pool.query(sql, [id, session.user.id, adminNote]);
  if (rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
