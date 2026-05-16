import { NextResponse } from "next/server";
import { auth } from "@/auth";

export type AdminGuard =
  | { ok: true; userId: string }
  | { ok: false; res: NextResponse };

export async function requireAdmin(): Promise<AdminGuard> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId: session.user.id };
}
