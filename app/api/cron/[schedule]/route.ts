import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { JOBS, runSchedule, type Schedule } from "@/lib/jobs";

// Called by the Netlify scheduled functions in netlify/functions/ (and by you, for testing):
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/hourly
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || secret.length < 32) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request, { params }: { params: Promise<{ schedule: string }> }) {
  if (!authorized(request)) return new NextResponse("Not found", { status: 404 });
  const { schedule } = await params;
  if (!(schedule in JOBS)) return new NextResponse("Unknown schedule", { status: 404 });
  return NextResponse.json(await runSchedule(schedule as Schedule));
}

export const GET = POST;
