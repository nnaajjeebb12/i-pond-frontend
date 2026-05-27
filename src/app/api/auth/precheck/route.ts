import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OwnerRow = {
  id: string;
  password_hash: string;
  expires_at: Date | null;
};

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ result: "invalid" });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ result: "invalid" });
  }

  const { rows } = await pool.query<OwnerRow>(
    `SELECT id, password_hash, expires_at
       FROM owners
      WHERE LOWER(email) = $1
      LIMIT 1`,
    [email]
  );

  const user = rows[0];
  if (!user || !user.password_hash) {
    return NextResponse.json({ result: "invalid" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return NextResponse.json({ result: "invalid" });
  }

  if (user.expires_at !== null && new Date(user.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ result: "expired" });
  }

  return NextResponse.json({ result: "ok" });
}
