import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { websiteCollections, websiteDesigns } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { designImages } from "@/lib/website-picker";
import { DesignEditor, Screenshots } from "./design-editor";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("packages.manage");
  const [row] = await db
    .select({ d: websiteDesigns, collection: websiteCollections.name })
    .from(websiteDesigns)
    .innerJoin(websiteCollections, eq(websiteCollections.id, websiteDesigns.collectionId))
    .where(and(eq(websiteDesigns.id, id), eq(websiteDesigns.orgId, ctx.orgId)));
  if (!row) notFound();
  const d = row.d;
  const images = (await designImages([d.id])).get(d.id) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/designs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Website designs
      </Link>
      <PageHeader title={d.name} description={`${d.key} · ${row.collection}`} />
      <Screenshots designId={d.id} images={images} />
      <DesignEditor
        id={d.id}
        initial={{
          name: d.name,
          description: d.description ?? "",
          previewUrl: d.previewUrl ?? "",
          pages: d.pages.join(", "),
          fonts: (d.styleOptions.fonts ?? []).join(", "),
          palettes: (d.styleOptions.colorPalettes ?? []).map((p) => p.join(", ")).join("\n"),
          inStarterSet: d.inStarterSet,
          inBusiness: d.inBusiness,
          status: d.status,
        }}
      />
    </div>
  );
}
