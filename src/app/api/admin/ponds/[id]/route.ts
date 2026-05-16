import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  pond_code?: unknown;
  name?: unknown;
  location?: unknown;
  company_name?: unknown;
  capacity?: unknown;
  area?: unknown;
};

// ---------- PATCH /api/admin/ponds/:id ----------

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { id: idParam } = await ctx.params;
  const pondId = Number(idParam);
  if (!Number.isFinite(pondId)) {
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

  if (typeof body.pond_code === "string") {
    const code = body.pond_code.trim();
    if (!code)
      return NextResponse.json({ error: "pond_code_required" }, { status: 400 });
    params.push(code);
    sets.push(`pond_code = $${params.length}`);
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name)
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    params.push(name);
    sets.push(`name = $${params.length}`);
  }
  if (typeof body.location === "string" || body.location === null) {
    params.push(body.location);
    sets.push(`location = $${params.length}`);
  }
  if (typeof body.company_name === "string" || body.company_name === null) {
    params.push(body.company_name);
    sets.push(`company_name = $${params.length}`);
  }
  if (body.capacity !== undefined) {
    const cap =
      body.capacity === null || body.capacity === "" ? null : Number(body.capacity);
    if (cap !== null && !Number.isFinite(cap))
      return NextResponse.json({ error: "invalid_capacity" }, { status: 400 });
    params.push(cap);
    sets.push(`capacity = $${params.length}`);
  }
  if (body.area !== undefined) {
    const ar = body.area === null || body.area === "" ? null : Number(body.area);
    if (ar !== null && !Number.isFinite(ar))
      return NextResponse.json({ error: "invalid_area" }, { status: 400 });
    params.push(ar);
    sets.push(`area = $${params.length}`);
  }

  if (sets.length === 0) {
    return NextResponse.json({ ok: true });
  }

  params.push(pondId);
  try {
    const { rowCount } = await pool.query(
      `UPDATE ponds SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    if (rowCount === 0)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      return NextResponse.json({ error: "pond_code_taken" }, { status: 409 });
    }
    console.error("admin_ponds_patch_error", e);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// ---------- DELETE /api/admin/ponds/:id ----------

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  const { id: idParam } = await ctx.params;
  const pondId = Number(idParam);
  if (!Number.isFinite(pondId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const confirm = new URL(req.url).searchParams.get("confirm") === "true";

  const { rows: readings } = await pool.query<{ has_data: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM sensor_readings WHERE pond_id = $1) AS has_data`,
    [pondId]
  );

  if (readings[0]?.has_data && !confirm) {
    return NextResponse.json(
      { error: "pond_has_sensor_data", requiresConfirm: true },
      { status: 409 }
    );
  }

  // Sensor readings have FK to ponds (not ON DELETE CASCADE). Wipe them if confirmed.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM sensor_readings WHERE pond_id = $1`, [pondId]);
    const { rowCount } = await client.query(
      `DELETE FROM ponds WHERE id = $1`,
      [pondId]
    );
    await client.query("COMMIT");
    if (rowCount === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("admin_ponds_delete_error", err);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  } finally {
    client.release();
  }
}
