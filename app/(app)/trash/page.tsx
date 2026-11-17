import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/session";
import { KIND_LABELS, listTrash, retentionDays } from "@/lib/trash";
import { TrashList } from "./trash-list";

export default async function TrashPage() {
  const ctx = await requirePermission("projects.manage");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const days = retentionDays(org.settings);
  const items = await listTrash(ctx.orgId);
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Trash" description={`Deleted tickets, comments, files and client contacts. They can be restored for ${days} days, then they're deleted for good.`} />
      <TrashList
        canPurge={await can(ctx.orgId, ctx.role, "settings.manage")}
        kinds={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))}
        items={items.map((i) => ({
          kind: i.kind,
          kindLabel: KIND_LABELS[i.kind],
          id: i.id,
          label: i.label,
          detail: i.detail,
          href: i.href,
          deleted: fmt.format(i.deletedAt),
          deletedBy: i.deletedBy,
          daysLeft: Math.max(0, days - Math.floor((Date.now() - i.deletedAt.getTime()) / 86400_000)),
          blockedReason: i.blockedReason,
        }))}
      />
    </div>
  );
}
