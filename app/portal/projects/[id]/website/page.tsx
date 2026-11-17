import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft, Lock } from "lucide-react";
import { db } from "@/db";
import { websiteDesigns } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canApprove, portalProject, requirePortal } from "@/lib/portal";
import { pickerFor, projectPicker } from "@/lib/website-picker";
import { Picker } from "./picker";

export default async function WebsitePickerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePortal();
  const p = await portalProject(ctx, id);
  if (!p) notFound();
  const picker = await pickerFor(p.id);
  const { offers, selection } = await projectPicker(p.id);
  if (!picker || offers.length === 0) notFound();
  const [chosen] = selection ? await db.select().from(websiteDesigns).where(eq(websiteDesigns.id, selection.designId)) : [];

  return (
    <div className="space-y-6">
      <Link href={`/portal/projects/${p.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {p.name}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Choose your website design</h1>
        <p className="text-muted-foreground">
          Preview each design live, mark your favorites, compare them, then pick one
          {picker.access === "full" ? " and choose your colors and font" : ""}.
        </p>
      </div>

      {selection?.lockedAt && chosen ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4" /> You chose {chosen.name}
            </CardTitle>
            <CardDescription>It&apos;s locked in and we&apos;re working on it. To change it, reply on a request or contact us; depending on your package it may use a revision round.</CardDescription>
          </CardHeader>
          {(selection.colors?.length || selection.fonts?.length) && (
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              {selection.colors?.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5">
                  <span className="size-5 rounded border" style={{ backgroundColor: c }} aria-hidden />
                  <span className="font-mono text-xs">{c}</span>
                </span>
              ))}
              {selection.fonts?.length ? <span>Font: {selection.fonts.join(", ")}</span> : null}
            </CardContent>
          )}
        </Card>
      ) : (
        <Picker
          projectId={p.id}
          full={picker.access === "full"}
          canSubmit={canApprove(ctx, p.clientId)}
          readOnly={Boolean(ctx.preview)}
          initialDesignId={selection?.designId ?? null}
          offers={offers.map(({ o, d, images }) => ({
            offerId: o.id,
            designId: d.id,
            name: d.name,
            description: d.description,
            previewUrl: d.previewUrl,
            pages: d.pages,
            palettes: d.styleOptions.colorPalettes ?? [],
            fonts: d.styleOptions.fonts ?? [],
            images,
            favorite: o.isFavorite,
          }))}
        />
      )}
    </div>
  );
}
