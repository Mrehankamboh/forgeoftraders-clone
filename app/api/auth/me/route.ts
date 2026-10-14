import { NextResponse } from "next/server";
import { hasDatabase, sql } from "@/lib/db";
import { userFromSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!hasDatabase()) return NextResponse.json({ role: null });
  const user = await userFromSession(sql(), request);
  return NextResponse.json({ role: user?.role || null, id: user?.id || null });
}
