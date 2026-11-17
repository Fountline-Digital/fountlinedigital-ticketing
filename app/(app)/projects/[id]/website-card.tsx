import { eq, inArray } from "drizzle-orm";
import { LayoutTemplate } from "lucide-react";
import { db } from "@/db";
import { users, websiteDesigns } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eligibleDesigns, pickerFor, projectPicker } from "@/lib/website-picker";
import { OfferDesigns, OfferRow, UnlockButtons } from "./website-card-client";

/** Team view of the website picker: offer designs, see favorites and the client's choice. */
export async function WebsiteCard({ projectId, orgId, canManage, timezone }: { projectId: string; orgId: string; canManage: boolean; timezone: string }) {
  const picker = await pickerFor(projectId);
  const { offers, selection } = await projectPicker(projectId);
  if ((!picker || picker.access === "none") && offers.length === 0) return null;
  const eligible = picker ? await eligibleDesigns(orgId, picker.access) : [];
  const offerable = eligible.filter((e) => !offers.some((o) => o.d.id === e.d.id)).map((e) => ({ id: e.d.id, label: `${e.d.name} · ${e.d.key}` }));
  const [chosen] = selection ? await db.select().from(websiteDesigns).where(eq(websiteDesigns.id, selection.designId)) : [];
  const [by] = selection?.submittedByUserId ? await db.select({ name: users.name, email: users.email }).from(users).where(inArray(users.id, [selection.submittedByUserId])) : [];
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutTemplate className="size-4" />
          Website picker
        </CardTitle>
        <CardDescription>
          {picker?.access === "starter" ? "Essentials: starter set designs." : "Business: full catalog, plus colors and fonts."} Up to {picker?.maxOffers ?? 5} designs.
        </CardDescription>
        {canManage && !selection?.lockedAt && offerable.length > 0 && offers.length < (picker?.maxOffers ?? 5) && (
          <CardAction>
            <OfferDesigns projectId={projectId} options={offerable} remaining={(picker?.maxOffers ?? 5) - offers.length} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{eligible.length === 0 ? "No Active designs fit this package yet. Set some to Active in Website designs." : "Nothing offered yet."}</p>
        ) : (
          <div className="space-y-1.5">
            {offers.map(({ o, d }) => (
              <OfferRow
                key={o.id}
                offerId={o.id}
                name={d.name}
                designKey={d.key}
                favorite={o.isFavorite}
                chosen={selection?.designId === d.id}
                canRemove={canManage && !selection?.lockedAt && selection?.designId !== d.id}
              />
            ))}
          </div>
        )}

        {selection && chosen && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Client&apos;s choice: {chosen.name}</span>
              {selection.lockedAt ? <Badge>Submitted</Badge> : <Badge variant="outline">Unlocked for changes</Badge>}
            </div>
            {selection.colors && selection.colors.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Colors</span>
                {selection.colors.map((c) => (
                  <span key={c} title={c} className="size-5 rounded border" style={{ backgroundColor: c }} />
                ))}
                <span className="font-mono text-xs text-muted-foreground">{selection.colors.join(" ")}</span>
              </div>
            )}
            {selection.fonts && selection.fonts.length > 0 && <p className="text-xs text-muted-foreground">Font: {selection.fonts.join(", ")}</p>}
            {selection.submittedAt && (
              <p className="text-xs text-muted-foreground">
                {fmt.format(selection.submittedAt)}
                {by && ` by ${by.name || by.email}`}. Details and files were added to the design phase tickets.
              </p>
            )}
            {canManage && selection.lockedAt && <UnlockButtons projectId={projectId} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
