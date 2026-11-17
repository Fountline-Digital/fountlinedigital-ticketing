import { redirect } from "next/navigation";
import { pendingLegalDocs, requirePortal } from "@/lib/portal";
import { TermsForm } from "./terms-form";

export default async function TermsPage() {
  const ctx = await requirePortal({ skipTerms: true });
  if (ctx.preview) redirect("/portal");
  const docs = await pendingLegalDocs(ctx.orgId, ctx.user.id);
  if (docs.length === 0) redirect("/portal");
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: ctx.org.timezone });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{docs.length === 2 ? "Terms and privacy" : docs[0].kind === "terms" ? "Updated terms of service" : "Updated privacy policy"}</h1>
        <p className="text-muted-foreground">Please read and accept before continuing.</p>
      </div>
      <TermsForm
        docs={docs.map((d) => ({
          id: d.id,
          title: d.kind === "terms" ? "Terms of service" : "Privacy policy",
          version: d.version,
          date: d.publishedAt ? fmt.format(d.publishedAt) : "",
          body: d.body,
        }))}
      />
    </div>
  );
}
