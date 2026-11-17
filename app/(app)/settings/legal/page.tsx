import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { legalDocuments, organizations, termsAcceptances } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { requirePermission } from "@/lib/session";
import { LegalEditor } from "./legal-editor";

export default async function LegalPage() {
  const ctx = await requirePermission("settings.manage");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });
  const docs = await Promise.all(
    (["terms", "privacy"] as const).map(async (kind) => {
      const [latest] = await db
        .select()
        .from(legalDocuments)
        .where(and(eq(legalDocuments.orgId, ctx.orgId), eq(legalDocuments.kind, kind)))
        .orderBy(desc(legalDocuments.version))
        .limit(1);
      const [accepted] = latest ? await db.select({ n: count() }).from(termsAcceptances).where(eq(termsAcceptances.documentId, latest.id)) : [{ n: 0 }];
      return {
        kind,
        title: kind === "terms" ? "Terms of service" : "Privacy policy",
        version: latest?.version ?? 0,
        published: latest?.publishedAt ? fmt.format(latest.publishedAt) : null,
        body: latest?.body ?? "",
        accepted: accepted?.n ?? 0,
      };
    }),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Terms & privacy"
        description="Clients accept the current versions the first time they sign in to the portal, and again whenever you publish a change. Each acceptance is logged."
      />
      {docs.map((d) => (
        <LegalEditor key={d.kind} {...d} />
      ))}
    </div>
  );
}
