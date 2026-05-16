import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["admin", "owner", "viewer"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PatchBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  pondIds?: unknown;
  company_name?: unknown;
};

// ---------- PATCH /api/admin/users/:id ----------

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name)
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    params.push(name);
    sets.push(`name = $${params.length}`);
  }

  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!email)
      return NextResponse.json({ error: "email_required" }, { status: 400 });
    params.push(email);
    sets.push(`email = $${params.length}`);
  }

  if (typeof body.role === "string") {
    if (!VALID_ROLES.has(body.role))
      return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    params.push(body.role);
    sets.push(`role = $${params.length}`);
  }

  if (typeof body.company_name === "string" || body.company_name === null) {
    params.push(body.company_name);
    sets.push(`company_name = $${params.length}`);
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6)
      return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    const hash = await bcrypt.hash(body.password, 10);
    params.push(hash);
    sets.push(`password_hash = $${params.length}`);
  }

  const updatePondIds = Array.isArray(body.pondIds);
  const pondIds: number[] = updatePondIds
    ? (body.pondIds as unknown[])
        .map((p) => Number(p))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n))
    : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query<{ id: string }>(
      `SELECT id FROM owners WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (sets.length > 0) {
      params.push(id);
      try {
        await client.query(
          `UPDATE owners SET ${sets.join(", ")} WHERE id = $${params.length}`,
          params
        );
      } catch (e: unknown) {
        const err = e as { code?: string };
        await client.query("ROLLBACK");
        if (err.code === "23505") {
          return NextResponse.json({ error: "email_taken" }, { status: 409 });
        }
        throw e;
      }
    }

    if (updatePondIds) {
      await client.query(`DELETE FROM user_pond_access WHERE user_id = $1`, [id]);
      if (pondIds.length > 0) {
        await client.query(
          `INSERT INTO user_pond_access (user_id, pond_id)
           SELECT $1, p.id FROM ponds p WHERE p.id = ANY($2::int[])
           ON CONFLICT DO NOTHING`,
          [id, pondIds]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("admin_users_patch_error", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

// ---------- DELETE /api/admin/users/:id ----------

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (id === guard.userId) {
    return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
  }

  const { rowCount } = await pool.query(`DELETE FROM owners WHERE id = $1`, [id]);
  if (rowCount === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
