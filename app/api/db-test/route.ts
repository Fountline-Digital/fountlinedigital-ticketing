import { db } from "@/db";
import { organizations } from "@/db/schema";

export async function GET() {
  const rows = await db.select().from(organizations);
  return Response.json({ ok: true, organizations: rows });
}