import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLog,
  contactFormRules,
  leadStages,
  memberships,
  organizations,
  priorities,
  serviceLines,
  teamRoles,
  ticketChecklistItems,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextTicketNumber, ticketKey } from "@/lib/keys";
import { announce, notify } from "@/lib/notify";
import { pickAssignee } from "@/lib/team-roles";
import { assignByRule } from "@/lib/assignment";

// Contact form submissions from fountlinedigital.com become Lead tickets.

export type ContactSubmission = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  message?: string;
  /** Everything the visitor picked or typed (service, package, budget, timeline, ...). */
  fields: Record<string, string | string[]>;
  ip: string | null;
};

const norm = (v: string) => v.trim().toLowerCase();
const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).map(norm).filter(Boolean);

/** True when every condition matches: the form's value (or one of its values) is one of the rule's values. */
export function ruleMatches(conditions: Record<string, string | string[]>, fields: Record<string, string | string[]>) {
  return Object.entries(conditions).every(([key, want]) => {
    const wanted = asList(want);
    if (wanted.length === 0) return true;
    const got = asList(fields[key] ?? fields[Object.keys(fields).find((k) => norm(k) === norm(key)) ?? ""]);
    return got.some((g) => wanted.includes(g));
  });
}

/** Too many submissions from one IP in the last hour? (counted from the audit log) */
export async function rateLimited(orgId: string, ip: string | null) {
  if (!ip) return false;
  const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
  const perHour = org?.settings.intake?.rateLimitPerHour ?? 5;
  const recent = await db
    .select({ id: auditLog.id, ip: auditLog.ipAddress })
    .from(auditLog)
    .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "lead.intake"), gte(auditLog.createdAt, new Date(Date.now() - 3_600_000))));
  return recent.filter((r) => r.ip === ip).length >= perHour;
}

const fill = (template: string, s: ContactSubmission) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = k === "name" ? s.name : k === "email" ? s.email : k === "company" ? s.company : k === "phone" ? s.phone : s.fields[k];
    return (Array.isArray(v) ? v.join(", ") : v) || "";
  });

/** Creates the lead ticket for a submission using the first matching rule (or sensible defaults). */
export async function createLead(orgId: string, s: ContactSubmission) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const rules = await db
    .select()
    .from(contactFormRules)
    .where(and(eq(contactFormRules.orgId, orgId), eq(contactFormRules.isActive, true)))
    .orderBy(asc(contactFormRules.sortOrder));
  const rule = rules.find((r) => ruleMatches(r.conditions, s.fields)) ?? null;

  const [leadType] = rule?.ticketTypeId
    ? await db.select().from(ticketTypes).where(eq(ticketTypes.id, rule.ticketTypeId))
    : await db.select().from(ticketTypes).where(and(eq(ticketTypes.orgId, orgId), eq(ticketTypes.kind, "lead"))).limit(1);
  const statuses = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isActive, true)))
    .orderBy(asc(ticketStatuses.sortOrder));
  const status = statuses.find((x) => x.isDefault) ?? statuses[0];
  const [priority] = rule?.priorityId
    ? await db.select().from(priorities).where(eq(priorities.id, rule.priorityId))
    : await db.select().from(priorities).where(and(eq(priorities.orgId, orgId), eq(priorities.isDefault, true))).limit(1);
  const [stage] = await db
    .select()
    .from(leadStages)
    .where(and(eq(leadStages.orgId, orgId), eq(leadStages.kind, "open"), eq(leadStages.isActive, true)))
    .orderBy(asc(leadStages.sortOrder))
    .limit(1);
  if (!leadType || !status || !priority) throw new Error("Lead ticket type, status or priority missing");

  const [sales] = await db.select().from(teamRoles).where(and(eq(teamRoles.orgId, orgId), eq(teamRoles.key, "sales"), eq(teamRoles.isActive, true)));
  let assignee = rule?.assigneeMembershipId ?? null;
  if (assignee) {
    const [m] = await db.select().from(memberships).where(and(eq(memberships.id, assignee), eq(memberships.status, "active")));
    if (!m) assignee = null;
  }
  // No fixed person on the rule: a default-assignee rule for leads (fixed or round robin), then the Sales team
  if (!assignee) {
    const lineNames = asList(s.fields.service);
    const lines = lineNames.length ? await db.select().from(serviceLines).where(eq(serviceLines.orgId, orgId)) : [];
    const line = lines.find((l) => lineNames.includes(norm(l.name)) || lineNames.includes(norm(l.code)));
    assignee = await assignByRule(orgId, { serviceLineId: line?.id ?? null, ticketTypeId: leadType.id });
  }
  assignee ??= await pickAssignee(orgId, sales?.id ?? null);

  const answers = Object.entries(s.fields)
    .filter(([, v]) => (Array.isArray(v) ? v.length : v))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n");
  const description = [s.message?.trim(), answers ? `From the contact form:\n${answers}` : null].filter(Boolean).join("\n\n") || null;
  const title = (fill(rule?.titleTemplate ?? "New inquiry: {name}", s).trim() || `New inquiry: ${s.name}`).slice(0, 200);

  const t = await db.transaction(async (tx) => {
    const n = await nextTicketNumber(tx, orgId);
    const [row] = await tx
      .insert(tickets)
      .values({
        orgId,
        number: n,
        key: ticketKey(org.keyPrefix, n),
        ticketTypeId: leadType.id,
        statusId: status.id,
        priorityId: priority.id,
        title,
        description,
        source: "contact_form",
        teamRoleId: sales?.id ?? null,
        assigneeMembershipId: assignee,
        leadStageId: stage?.id ?? null,
        leadContact: { name: s.name, email: s.email, phone: s.phone || undefined, company: s.company || undefined },
        formData: s.fields,
      })
      .returning();
    const checklist = rule?.checklist ?? [];
    if (checklist.length) {
      await tx.insert(ticketChecklistItems).values(checklist.map((label, i) => ({ orgId, ticketId: row.id, position: i + 1, label })));
    }
    return row;
  });

  await audit({
    orgId,
    actorKind: "system",
    action: "lead.intake",
    entityType: "ticket",
    entityId: t.id,
    entityKey: t.key,
    metadata: { rule: rule?.name ?? null, email: s.email },
    ipAddress: s.ip,
  });

  const managers = await db
    .select({ userId: memberships.userId, id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active")));
  const recipients = managers.filter((m) => m.role === "admin" || m.role === "manager" || m.id === assignee).map((m) => m.userId);
  const msg = { title: `New lead ${t.key}: ${s.name}${s.company ? ` (${s.company})` : ""}`, body: title, url: `/tickets/${t.key}` };
  await notify(db, { orgId, userIds: recipients, eventKey: "lead.new", ticketId: t.id, ...msg });
  announce(orgId, "lead.new", msg);
  return t;
}
