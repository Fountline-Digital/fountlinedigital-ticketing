import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import { listFiles } from "@/lib/file-access";
import { requirePortal } from "@/lib/portal";

export default async function PortalFilesPage() {
  const ctx = await requirePortal();
  const files = await listFiles({ clientIds: ctx.clientIds }, ctx.user.id, ctx.org.timezone);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-muted-foreground">Everything we&apos;ve shared with you and everything you&apos;ve sent us.</p>
      </div>
      <Card>
        <CardContent className="space-y-2">
          {files.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No files yet.</p>}
          {files.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${f.id}?view=1`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
                  {f.name}
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(f.size)} · {f.uploadedByMe ? "you" : f.uploadedBy} · {f.when}
                  {f.ticketKey && (
                    <>
                      {" · "}
                      <Link href={`/portal/tickets/${f.ticketKey}`} className="font-mono hover:underline">
                        {f.ticketKey}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <a href={`/api/files/${f.id}`} aria-label={`Download ${f.name}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                <Download />
              </a>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
