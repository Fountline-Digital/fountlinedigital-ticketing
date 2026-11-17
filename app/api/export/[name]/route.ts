import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { EXPORTS } from "@/lib/exports";
import { requirePermission } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await requirePermission("settings.manage");
  const { name } = await params;
  const exp = EXPORTS[name];
  if (!exp) return new NextResponse("Not found", { status: 404 });
  const { header, rows } = await exp.run(ctx.orgId);
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "data.export", metadata: { export: name, rows: rows.length } });
  return new NextResponse(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
