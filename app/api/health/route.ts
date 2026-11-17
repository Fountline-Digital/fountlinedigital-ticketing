import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// For uptime monitors: 200 when the app and database answer, 503 when not.
// Public on purpose, so it shows nothing beyond up/down and timing.
export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", dbMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
