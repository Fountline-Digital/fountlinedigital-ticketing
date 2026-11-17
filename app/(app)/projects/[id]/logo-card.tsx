import { Shapes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isOpenBatch, logoSettings, projectBatches } from "@/lib/logo-picker";
import { DraftBatch, StartBatchButton } from "./logo-card-client";

const STATUS: Record<string, string> = { draft: "Draft", published: "With the client", chosen: "Chosen", revision_requested: "New batch requested" };
const pad = (n: number) => String(n).padStart(2, "0");

/** Team view of logo batches: upload concepts, publish, and see what the client picked. */
export async function LogoCard({ projectId, showIfEmpty }: { projectId: string; showIfEmpty: boolean }) {
  const settings = await logoSettings(projectId);
  const batches = await projectBatches(projectId);
  if (!settings || (settings.perBatch === null && batches.length === 0 && !showIfEmpty)) return null;
  const open = batches.find((b) => isOpenBatch(b.batch.status));
  const chosen = batches.find((b) => b.batch.status === "chosen");
  const canStart = !open && !chosen;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shapes className="size-4" />
          Logo concepts
        </CardTitle>
        <CardDescription>
          {settings.perBatch ? `${settings.perBatch} concepts per batch on this package.` : "Not part of this package; add batches if logo work was added on."}
        </CardDescription>
        {canStart && (
          <CardAction>
            <StartBatchButton projectId={projectId} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {batches.length === 0 && <p className="text-sm text-muted-foreground">No batches yet.</p>}
        {batches.map(({ batch: b, concepts }) => (
          <div key={b.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Batch {pad(b.number)}</span>
              <Badge variant={b.status === "chosen" ? "default" : "outline"}>{STATUS[b.status] ?? b.status}</Badge>
              <span className="text-xs text-muted-foreground">{concepts.length} concepts</span>
            </div>
            {b.status === "draft" ? (
              <DraftBatch
                batchId={b.id}
                projectId={projectId}
                target={settings.perBatch}
                concepts={concepts.map(({ c, fileName }) => ({ id: c.id, key: c.key, fileId: c.fileId, name: fileName }))}
              />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {concepts.map(({ c }) => (
                  <div key={c.id} className={`relative overflow-hidden rounded border bg-white ${c.isChosen ? "ring-2 ring-primary" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${c.fileId}?view=1`} alt={c.key} className="aspect-square w-full object-contain p-1" loading="lazy" />
                    <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">
                      {c.number}
                      {c.isFavorite && " ♥"}
                      {c.isChosen && " ✓"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {b.clientComment && <p className="text-xs whitespace-pre-wrap text-muted-foreground">Client: {b.clientComment}</p>}
          </div>
        ))}
        {chosen && <p className="text-xs text-muted-foreground">Upload the final logo files (AI, SVG, PNG…) to the project files and share them with the client.</p>}
      </CardContent>
    </Card>
  );
}
