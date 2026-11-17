import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { projectBatches } from "@/lib/logo-picker";
import { canApprove, portalProject, requirePortal } from "@/lib/portal";
import { LogoPicker } from "./logo-picker";

const pad = (n: number) => String(n).padStart(2, "0");

export default async function LogosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortal();
  const p = await portalProject(ctx, id);
  if (!p) notFound();
  const batches = (await projectBatches(p.id)).filter((b) => b.batch.status !== "draft"); // drafts are the team's
  if (batches.length === 0) notFound();
  const current = batches[0];
  const chosen = batches.find((b) => b.batch.status === "chosen");
  const chosenConcept = chosen?.concepts.find((c) => c.c.isChosen);

  return (
    <div className="space-y-6">
      <Link href={`/portal/projects/${p.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {p.name}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Your logo</h1>
        <p className="text-muted-foreground">
          {chosenConcept
            ? "You've chosen your logo. We'll share the final files on your project."
            : current.batch.status === "published"
              ? `Batch ${pad(current.batch.number)}: mark favorites, compare them, then choose one or ask for a new batch.`
              : "We're working on your next batch of concepts."}
        </p>
      </div>

      {chosenConcept ? (
        <Card>
          <CardHeader>
            <CardTitle>You chose concept {chosenConcept.c.number}</CardTitle>
            <CardDescription>{chosenConcept.c.key}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${chosenConcept.c.fileId}?view=1`} alt="Your chosen logo" className="mx-auto max-h-80 w-full rounded-lg bg-white object-contain p-6" />
          </CardContent>
        </Card>
      ) : current.batch.status === "published" ? (
        <LogoPicker
          batchId={current.batch.id}
          canDecide={canApprove(ctx, p.clientId)}
          readOnly={Boolean(ctx.preview)}
          concepts={current.concepts.map(({ c }) => ({ id: c.id, number: c.number, key: c.key, fileId: c.fileId, favorite: c.isFavorite }))}
        />
      ) : null}

      {batches.length > 1 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Earlier batches</summary>
          <div className="space-y-4 border-t p-4">
            {batches.slice(chosenConcept || current.batch.status === "published" ? 1 : 0).map(({ batch: b, concepts }) => (
              <div key={b.id} className="space-y-2">
                <p className="text-sm font-medium">Batch {pad(b.number)}</p>
                {b.clientComment && <p className="text-xs whitespace-pre-wrap text-muted-foreground">Your notes: {b.clientComment}</p>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {concepts.map(({ c }) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={c.id} src={`/api/files/${c.fileId}?view=1`} alt={`Batch ${pad(b.number)} concept ${c.number}`} className="aspect-square w-full rounded border bg-white object-contain p-1" loading="lazy" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
