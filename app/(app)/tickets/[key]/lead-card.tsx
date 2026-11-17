import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Mail, Phone, Target } from "lucide-react";
import Link from "next/link";
import { db } from "@/db";
import { clients, lostReasons, packages } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stagesAndReasons, suggestCode } from "@/lib/leads";
import { can, type Role } from "@/lib/permissions";
import { MoveLead } from "../../leads/move-lead";
import { ConvertLead } from "./convert-lead";

type Lead = {
  id: string;
  key: string;
  orgId: string;
  leadStageId: string | null;
  lostReasonId: string | null;
  clientId: string | null;
  leadContact: { name?: string; email?: string; phone?: string; company?: string } | null;
  formData: Record<string, unknown> | null;
};

/** Contact details, stage and one-click conversion for a lead ticket. */
export async function LeadCard({ t, role }: { t: Lead; role: Role }) {
  const { stages, reasons } = await stagesAndReasons(t.orgId);
  const [reason] = t.lostReasonId ? await db.select().from(lostReasons).where(eq(lostReasons.id, t.lostReasonId)) : [];
  const [client] = t.clientId ? await db.select().from(clients).where(eq(clients.id, t.clientId)) : [];
  const canConvert = !t.clientId && (await can(t.orgId, role, "clients.manage"));
  const pkgs = canConvert
    ? await db
        .select({ id: packages.id, key: packages.key, name: packages.name })
        .from(packages)
        .where(and(eq(packages.orgId, t.orgId), eq(packages.status, "active"), isNotNull(packages.currentVersionId)))
        .orderBy(asc(packages.key))
    : [];
  const c = t.leadContact ?? {};
  const answers = Object.entries(t.formData ?? {}).filter(([, v]) => (Array.isArray(v) ? v.length : v !== "" && v !== null && v !== undefined));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="size-4" />
          Lead
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{c.name ?? "Unknown"}</p>
          {c.company && <p className="text-muted-foreground">{c.company}</p>}
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Mail className="size-3.5" /> {c.email}
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Phone className="size-3.5" /> {c.phone}
            </a>
          )}
        </div>

        {t.leadStageId && (
          <div className="space-y-1">
            <MoveLead ticketId={t.id} stageId={t.leadStageId} label="Lead stage" stages={stages.map((s) => ({ value: s.id, label: s.name, kind: s.kind }))} reasons={reasons.map((r) => ({ value: r.id, label: r.name }))} />
            {reason && <p className="text-xs text-muted-foreground">Lost: {reason.name}</p>}
          </div>
        )}

        {answers.length > 0 && (
          <dl className="space-y-1.5 border-t pt-3">
            {answers.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
                <dt className="truncate text-xs text-muted-foreground capitalize">{k.replace(/[_-]/g, " ")}</dt>
                <dd className="text-xs break-words">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </div>
            ))}
          </dl>
        )}

        {client ? (
          <p className="border-t pt-3 text-xs">
            Converted to{" "}
            <Link href={`/clients/${client.id}`} className="text-primary hover:underline">
              {client.name}
            </Link>
          </p>
        ) : (
          canConvert && (
            <ConvertLead
              ticketId={t.id}
              defaults={{
                clientName: c.company || c.name || "",
                code: suggestCode(c.company || c.name || ""),
                contactName: c.name ?? "",
                contactEmail: c.email ?? "",
                contactPhone: c.phone ?? "",
                projectName: c.company ? `${c.company} website` : "",
              }}
              packages={pkgs.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
              suggestedPackageKey={
                // The website sends package keys (FD-WEB-BUS); a lead may tick several, so take the first
                Array.isArray(t.formData?.package) ? ((t.formData.package as unknown[]).find((x) => typeof x === "string") as string | undefined) ?? null : typeof t.formData?.package === "string" ? (t.formData.package as string) : null
              }
            />
          )
        )}
      </CardContent>
    </Card>
  );
}
