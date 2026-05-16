import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  pond_id: number;
  pond_name: string | null;
  requested_by: string;
  requested_by_name: string | null;
  message: string;
  status: "pending" | "acknowledged" | "resolved";
  created_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  admin_note: string | null;
};

function serialize(r: Row) {
  return {
    id: r.id,
    pondId: r.pond_id,
    pondName: r.pond_name ?? `Pond ${r.pond_id}`,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    message: r.message,
    status: r.status,
    createdAt: r.created_at.toISOString(),
    acknowledgedAt: r.acknowledged_at?.toISOString() ?? null,
    resolvedAt: r.resolved_at?.toISOString() ?? null,
    adminNote: r.admin_note,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";

  const sql = isAdmin
    ? `SELECT m.id, m.pond_id, p.name AS pond_name,
              m.requested_by, o.name AS requested_by_name,
              m.message, m.status, m.created_at,
              m.acknowledged_at, m.resolved_at, m.admin_note
         FROM maintenance_requests m
         JOIN ponds p ON p.id = m.pond_id
         LEFT JOIN owners o ON o.id = m.requested_by
        ORDER BY m.created_at DESC
        LIMIT 500`
    : `SELECT m.id, m.pond_id, p.name AS pond_name,
              m.requested_by, o.name AS requested_by_name,
              m.message, m.status, m.created_at,
              m.acknowledged_at, m.resolved_at, m.admin_note
         FROM maintenance_requests m
         JOIN ponds p ON p.id = m.pond_id
         LEFT JOIN owners o ON o.id = m.requested_by
         JOIN user_pond_access upa ON upa.pond_id = m.pond_id
        WHERE upa.user_id = $1
        ORDER BY m.created_at DESC
        LIMIT 500`;

  const { rows } = await pool.query<Row>(sql, isAdmin ? [] : [session.user.id]);
  return NextResponse.json(rows.map(serialize));
}

type PostBody = { pondId?: unknown; message?: unknown };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pondId = Number(body.pondId);
  const message = String(body.message ?? "").trim();
  if (!Number.isFinite(pondId)) {
    return NextResponse.json({ error: "invalid_pond" }, { status: 400 });
  }
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: "invalid_message" }, { status: 400 });
  }

  if (session.user.role !== "admin") {
    const { rows } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM user_pond_access
        WHERE user_id = $1 AND pond_id = $2 LIMIT 1`,
      [session.user.id, pondId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { rows } = await pool.query<Row>(
    `INSERT INTO maintenance_requests (pond_id, requested_by, message)
     VALUES ($1, $2, $3)
     RETURNING id, pond_id,
       (SELECT name FROM ponds WHERE id = $1) AS pond_name,
       requested_by,
       (SELECT name FROM owners WHERE id = $2) AS requested_by_name,
       message, status, created_at, acknowledged_at, resolved_at, admin_note`,
    [pondId, session.user.id, message]
  );

  return NextResponse.json(serialize(rows[0]), { status: 201 });
}
