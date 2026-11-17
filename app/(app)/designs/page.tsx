import Link from "next/link";
import { asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectDesignOffers, websiteCollections, websiteDesigns } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { designImages } from "@/lib/website-picker";
import { NewCollectionButton, NewDesignButton } from "./catalog-buttons";

const STATUS: Record<string, string> = { draft: "Draft", active: "Active", hidden: "Hidden", retired: "Retired" };

export default async function DesignsPage() {
  const ctx = await requirePermission("packages.manage");
  const collections = await db.select().from(websiteCollections).where(eq(websiteCollections.orgId, ctx.orgId)).orderBy(asc(websiteCollections.number));
  const designs = await db.select().from(websiteDesigns).where(eq(websiteDesigns.orgId, ctx.orgId)).orderBy(asc(websiteDesigns.number));
  const images = await designImages(designs.map((d) => d.id));
  const offered = designs.length
    ? await db
        .select({ designId: projectDesignOffers.designId, n: count() })
        .from(projectDesignOffers)
        .where(inArray(projectDesignOffers.designId, designs.map((d) => d.id)))
        .groupBy(projectDesignOffers.designId)
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Website designs"
        description="The catalog clients pick from. Essentials clients see the starter set; Business sees everything tagged Business. Only Active designs can be offered."
        actions={<NewCollectionButton />}
      />
      {collections.map((c) => {
        const mine = designs.filter((d) => d.collectionId === c.id);
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle>{c.name}</CardTitle>
              <CardAction>
                <NewDesignButton collectionId={c.id} collectionName={c.name} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {mine.length === 0 && <p className="text-sm text-muted-foreground">No designs yet.</p>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mine.map((d) => {
                  const cover = images.get(d.id)?.[0];
                  return (
                    <Link key={d.id} href={`/designs/${d.id}`} className="group overflow-hidden rounded-lg border transition-colors hover:border-primary">
                      <div className="aspect-[16/10] bg-muted">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/files/${cover}?view=1`} alt="" className="size-full object-cover object-top" loading="lazy" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">No screenshot</div>
                        )}
                      </div>
                      <div className="space-y-1.5 p-3">
                        <p className="font-medium">{d.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{d.key}</p>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={d.status === "active" ? "default" : "outline"}>{STATUS[d.status]}</Badge>
                          {d.inStarterSet && <Badge variant="outline">Essentials</Badge>}
                          {d.inBusiness && <Badge variant="outline">Business</Badge>}
                          {(offered.find((o) => o.designId === d.id)?.n ?? 0) > 0 && (
                            <Badge variant="secondary">Offered {offered.find((o) => o.designId === d.id)?.n}×</Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
