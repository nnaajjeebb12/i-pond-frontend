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

  const { rows } = await pool.query<{ expires_at: Date | null }>(
    `SELECT expires_at FROM owners WHERE id = $1 LIMIT 1`,
    [session.user.id]
  );

  const expiresAt = rows[0]?.expires_at ?? null;
  if (expiresAt === null) {
    return NextResponse.json({ expiresAt: null, daysUntilExpiry: null });
  }

  const days = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return NextResponse.json({
    expiresAt: new Date(expiresAt).toISOString(),
    daysUntilExpiry: days,
  });
}
