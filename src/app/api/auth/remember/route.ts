import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THIRTY_DAYS = 30 * 24 * 60 * 60;

const COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export async function POST(req: NextRequest) {
  let body: { rememberMe?: unknown };
  try {
    body = (await req.json()) as { rememberMe?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const remember = body.rememberMe === true;
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME);
  if (!existing) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, rememberMe: remember });
  res.cookies.set({
    name: COOKIE_NAME,
    value: existing.value,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    ...(remember ? { maxAge: THIRTY_DAYS } : {}),
  });
  return res;
}
