import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PondRow = {
  id: number;
  pond_code: string | null;
  name: string;
  location: string | null;
  capacity: number | null;
  area: number | null;
  company_name: string | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "admin";

  const { rows } = await pool.query<PondRow>(
    isAdmin
      ? `SELECT p.id, p.pond_code, p.name, p.location, p.capacity, p.area, p.company_name
           FROM ponds p
          ORDER BY p.id`
      : `SELECT p.id, p.pond_code, p.name, p.location, p.capacity, p.area, p.company_name
           FROM ponds p
           JOIN user_pond_access upa ON upa.pond_id = p.id
          WHERE upa.user_id = $1
          ORDER BY p.id`,
    isAdmin ? [] : [session.user.id]
  );

  const ponds = rows.map((r) => ({
    id: String(r.id),
    pond_code: r.pond_code,
    name: r.name,
    location: r.location ?? "",
    capacity: r.capacity ?? 0,
    area: r.area ?? 0,
    company_name: r.company_name,
  }));

  return NextResponse.json(ponds);
}
