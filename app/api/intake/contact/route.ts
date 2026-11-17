import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { createLead, rateLimited } from "@/lib/intake";

// Called by fountlinedigital.com's own contact-form API route (server to server), never
// from the browser, so the secret stays private:
//
//   POST https://portal.fountlinedigital.com/api/intake/contact
//   Authorization: Bearer <INTAKE_SECRET>
//   { name, email, phone?, company?, message?, fields: { service, package, budget, timeline, ... },
//     honeypot?, ip? }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function authorized(request: Request) {
  const secret = process.env.INTAKE_SECRET ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return secret.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Honeypot: a hidden field real people never fill in. Pretend it worked so bots don't adapt.
  if (text(body.honeypot, 500)) return NextResponse.json({ ok: true, skipped: true });

  const name = text(body.name, 120);
  const email = text(body.email, 200).toLowerCase();
  if (!name || !EMAIL.test(email)) return NextResponse.json({ error: "name and a valid email are required" }, { status: 422 });

  const fields: Record<string, string | string[]> = {};
  if (body.fields && typeof body.fields === "object") {
    for (const [k, v] of Object.entries(body.fields as Record<string, unknown>).slice(0, 30)) {
      const key = k.slice(0, 40);
      if (typeof v === "string") fields[key] = v.slice(0, 2000);
      else if (Array.isArray(v)) fields[key] = v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)).slice(0, 20);
    }
  }
  const ip = text(body.ip, 64) || null;

  const slug = process.env.INTAKE_ORG_SLUG ?? "fountline-digital";
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  if (!org) return NextResponse.json({ error: "organization not found" }, { status: 500 });
  if (await rateLimited(org.id, ip)) return NextResponse.json({ error: "too many submissions, try again later" }, { status: 429 });

  const lead = await createLead(org.id, {
    name,
    email,
    phone: text(body.phone, 40) || undefined,
    company: text(body.company, 120) || undefined,
    message: text(body.message, 10_000) || undefined,
    fields,
    ip,
  });
  return NextResponse.json({ ok: true, lead: lead.key });
}
