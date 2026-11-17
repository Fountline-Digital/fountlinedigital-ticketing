import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { audit } from "@/lib/audit";
import { canOpenFile } from "@/lib/file-access";
import type { Role } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { signedDownloadUrl } from "@/lib/storage";

// Every download goes through here: access is checked and logged, then the browser
// is sent to a signed link that expires in 5 minutes.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const ctx = { ...u, orgId: u.membership.orgId, role: u.membership.role as Role };

  const [file] = await db.select().from(files).where(eq(files.id, id));
  if (!file || !(await canOpenFile(ctx, file))) return new NextResponse("Not found", { status: 404 });

  const inline = new URL(request.url).searchParams.get("view") === "1" && /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/.test(file.mimeType);
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.user.id,
    actorRole: ctx.role,
    action: inline ? "file.view" : "file.download",
    entityType: "file",
    entityId: file.id,
    metadata: { name: file.originalName },
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.redirect(await signedDownloadUrl(file.storageKey, file.originalName, inline), 302);
}
