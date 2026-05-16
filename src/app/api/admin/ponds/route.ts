import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserBrief = { id: string; name: string; role: string };

type PondRow = {
  id: number;
  pond_code: string | null;
  name: string;
  location: string | null;
  company_name: string | null;
  capacity: number | null;
  area: number | null;
  users: UserBrief[] | null;
};

// ---------- GET /api/admin/ponds ----------

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { rows } = await pool.query<PondRow>(
    `SELECT p.id, p.pond_code, p.name, p.location, p.company_name,
            p.capacity, p.area,
            COALESCE(
              (SELECT json_agg(json_build_object('id', o.id, 'name', o.name, 'role', o.role)
                               ORDER BY o.name)
                 FROM user_pond_access upa
                 JOIN owners o ON o.id = upa.user_id
                WHERE upa.pond_id = p.id),
              '[]'::json
            ) AS users
       FROM ponds p
      ORDER BY p.id`
  );

  return NextResponse.json(
    rows.map((r) => ({
      id: String(r.id),
      pond_code: r.pond_code,
      name: r.name,
      location: r.location,
      company_name: r.company_name,
      capacity: r.capacity,
      area: r.area,
      users: (r.users ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      })),
    }))
  );
}

// ---------- POST /api/admin/ponds ----------

type PostBody = {
  pond_code?: unknown;
  name?: unknown;
  location?: unknown;
  company_name?: unknown;
  capacity?: unknown;
  area?: unknown;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pondCode = String(body.pond_code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const location =
    typeof body.location === "string" ? body.location.trim() : null;
  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : null;
  const capacity =
    body.capacity === null || body.capacity === undefined || body.capacity === ""
      ? null
      : Number(body.capacity);
  const area =
    body.area === null || body.area === undefined || body.area === ""
      ? null
      : Number(body.area);

  if (!pondCode)
    return NextResponse.json({ error: "pond_code_required" }, { status: 400 });
  if (!name)
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (capacity !== null && !Number.isFinite(capacity))
    return NextResponse.json({ error: "invalid_capacity" }, { status: 400 });
  if (area !== null && !Number.isFinite(area))
    return NextResponse.json({ error: "invalid_area" }, { status: 400 });

  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO ponds (pond_code, name, location, company_name, capacity, area)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [pondCode, name, location, companyName, capacity, area]
    );
    return NextResponse.json(
      {
        id: String(rows[0].id),
        pond_code: pondCode,
        name,
        location,
        company_name: companyName,
        capacity,
        area,
        users: [],
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      return NextResponse.json({ error: "pond_code_taken" }, { status: 409 });
    }
    console.error("admin_ponds_post_error", e);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}
