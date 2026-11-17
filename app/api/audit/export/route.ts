import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { auditRows, type AuditFilters } from "@/lib/audit-query";
import { requirePermission } from "@/lib/session";

const MAX_ROWS = 50_000;

// Excel treats cells starting with = + - @ as formulas; prefix them so exported text stays text.
const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const ctx = await requirePermission("audit.view");
  const f = Object.fromEntries(new URL(request.url).searchParams) as AuditFilters;
  const rows = await auditRows(ctx.orgId, f, MAX_ROWS);

  const header = ["time_utc", "actor", "actor_email", "actor_role", "action", "entity_type", "entity_key", "entity_id", "before", "after", "details", "ip_address", "user_agent"];
  const lines = rows.map(({ a, name, email }) =>
    [
      a.createdAt,
      a.actorKind === "system" ? "System" : name,
      email,
      a.actorRole,
      a.action,
      a.entityType,
      a.entityKey,
      a.entityId,
      a.changes?.before ?? null,
      a.changes?.after ?? null,
      a.metadata,
      a.ipAddress,
      a.userAgent,
    ]
      .map(cell)
      .join(","),
  );

  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "audit.export", metadata: { filters: f, rows: rows.length } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + [header.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
