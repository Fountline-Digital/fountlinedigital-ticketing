import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { assignmentRules, contactFormRules, memberships, priorities, requestForms, serviceLines, ticketTypes, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { getOrg } from "@/lib/org-settings";
import { requirePermission } from "@/lib/session";
import { BackToSettings } from "../back";
import { AssignmentRules, ContactRules, RequestForms, SpamProtection } from "./intake-editors";

export default async function IntakeSettings() {
  const ctx = await requirePermission("settings.manage");
  const org = await getOrg(ctx.orgId);
  const [contact, forms, assign, types, prios, lines, team] = await Promise.all([
    db.select().from(contactFormRules).where(eq(contactFormRules.orgId, ctx.orgId)).orderBy(asc(contactFormRules.sortOrder)),
    db.select().from(requestForms).where(eq(requestForms.orgId, ctx.orgId)).orderBy(asc(requestForms.sortOrder)),
    db.select().from(assignmentRules).where(eq(assignmentRules.orgId, ctx.orgId)).orderBy(asc(assignmentRules.sortOrder)),
    db.select().from(ticketTypes).where(and(eq(ticketTypes.orgId, ctx.orgId), eq(ticketTypes.isActive, true))).orderBy(asc(ticketTypes.sortOrder)),
    db.select().from(priorities).where(and(eq(priorities.orgId, ctx.orgId), eq(priorities.isActive, true))).orderBy(asc(priorities.sortOrder)),
    db.select().from(serviceLines).where(and(eq(serviceLines.orgId, ctx.orgId), eq(serviceLines.isActive, true))).orderBy(asc(serviceLines.sortOrder)),
    db
      .select({ id: memberships.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active"), ne(memberships.role, "client")))
      .orderBy(asc(users.name)),
  ]);
  const opt = <T extends { id: string; name: string }>(rows: T[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  const people = team.map((m) => ({ value: m.id, label: m.name || m.email }));
  const nameOf = (list: { value: string; label: string }[], id: string | null) => list.find((x) => x.value === id)?.label ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackToSettings />
      <PageHeader title="Intake & assignment" description="How website inquiries and portal requests become tickets, and who gets them." />
      <ContactRules
        rules={contact.map((r) => ({
          id: r.id,
          name: r.name,
          isActive: r.isActive,
          conditions: Object.entries(r.conditions).map(([key, v]) => ({ key, values: Array.isArray(v) ? v : [v] })),
          ticketTypeId: r.ticketTypeId ?? "",
          priorityId: r.priorityId ?? "",
          assigneeMembershipId: r.assigneeMembershipId ?? "",
          titleTemplate: r.titleTemplate,
          checklist: r.checklist,
          summary: [nameOf(people, r.assigneeMembershipId) ?? "Automatic assignee", nameOf(opt(prios), r.priorityId)].filter(Boolean).join(" · "),
        }))}
        types={opt(types.filter((t) => t.kind === "lead"))}
        priorities={opt(prios)}
        people={people}
      />
      <RequestForms
        forms={forms.map((f) => ({ id: f.id, name: f.name, isActive: f.isActive, ticketTypeId: f.ticketTypeId, fields: f.fields.map((x) => ({ ...x, options: x.options ?? [], required: Boolean(x.required) })), summary: `${nameOf(opt(types), f.ticketTypeId) ?? "Unknown type"} · ${f.fields.length} fields` }))}
        types={opt(types.filter((t) => t.kind === "support" || t.kind === "change_request"))}
      />
      <AssignmentRules
        rules={assign.map((r) => ({
          id: r.id,
          name: r.name,
          isActive: r.isActive,
          serviceLineId: r.serviceLineId ?? "",
          ticketTypeId: r.ticketTypeId ?? "",
          strategy: r.strategy,
          assigneeMembershipId: r.assigneeMembershipId ?? "",
          poolMembershipIds: r.poolMembershipIds,
          summary: [
            nameOf(opt(lines), r.serviceLineId) ?? "Any service",
            nameOf(opt(types), r.ticketTypeId) ?? "any type",
            r.strategy === "fixed" ? `→ ${nameOf(people, r.assigneeMembershipId) ?? "nobody (inactive)"}` : `→ takes turns: ${r.poolMembershipIds.map((id) => nameOf(people, id)).filter(Boolean).join(", ")}`,
          ].join(" · "),
        }))}
        lines={opt(lines)}
        types={opt(types)}
        people={people}
      />
      <SpamProtection perHour={org.settings.intake?.rateLimitPerHour ?? 5} />
    </div>
  );
}
