import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["admin", "owner", "viewer"]);

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  created_at: Date;
  expires_at: Date | null;
  pond_ids: number[] | null;
};

// ---------- GET /api/admin/users ----------

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { rows } = await pool.query<UserRow>(
    `SELECT o.id, o.name, o.email, o.role, o.created_at, o.expires_at,
            COALESCE(
              (SELECT array_agg(upa.pond_id ORDER BY upa.pond_id)
                 FROM user_pond_access upa
                WHERE upa.user_id = o.id),
              ARRAY[]::int[]
            ) AS pond_ids
       FROM owners o
      ORDER BY o.created_at DESC NULLS LAST, o.name ASC`
  );

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at?.toISOString?.() ?? null,
      expiresAt: r.expires_at?.toISOString?.() ?? null,
      pondIds: (r.pond_ids ?? []).map((n) => String(n)),
    }))
  );
}

// ---------- POST /api/admin/users ----------

type PostBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  pondIds?: unknown;
  company_name?: unknown;
  expiresAt?: unknown;
};

function parseExpiresAt(raw: unknown): Date | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "invalid";
  return d;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");
  const companyName =
    typeof body.company_name === "string" ? body.company_name : null;

  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "email_required" }, { status: 400 });
  if (!password || password.length < 6)
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  if (!VALID_ROLES.has(role))
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });

  const pondIds: number[] = Array.isArray(body.pondIds)
    ? body.pondIds
        .map((p) => Number(p))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n))
    : [];

  const parsedExpiry = parseExpiresAt(body.expiresAt);
  if (parsedExpiry === "invalid") {
    return NextResponse.json({ error: "invalid_expires_at" }, { status: 400 });
  }
  // Default: now + 5 years if not provided.
  const expiresAt: Date =
    parsedExpiry ?? new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);

  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dup = await client.query<{ id: string }>(
      `SELECT id FROM owners WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (dup.rows.length > 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const ins = await client.query<{ id: string; created_at: Date; expires_at: Date | null }>(
      `INSERT INTO owners (name, email, role, password_hash, company_name, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at, expires_at`,
      [name, email, role, passwordHash, companyName, expiresAt]
    );
    const newId = ins.rows[0].id;

    if (pondIds.length > 0) {
      await client.query(
        `INSERT INTO user_pond_access (user_id, pond_id)
         SELECT $1, p.id FROM ponds p WHERE p.id = ANY($2::int[])
         ON CONFLICT DO NOTHING`,
        [newId, pondIds]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json(
      {
        id: newId,
        name,
        email,
        role,
        createdAt: ins.rows[0].created_at.toISOString(),
        expiresAt: ins.rows[0].expires_at?.toISOString?.() ?? null,
        pondIds: pondIds.map((n) => String(n)),
      },
      { status: 201 }
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("admin_users_post_error", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
