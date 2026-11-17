import "server-only";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { clientContacts, clients, leadStages, memberships, packageVersions, packages, priorities, projects, ticketStatuses, ticketTypes, tickets, users } from "@/db/schema";

type Export = { label: string; run: (orgId: string) => Promise<{ header: string[]; rows: unknown[][] }> };

const assignee = alias(users, "assignee_user");

export const EXPORTS: Record<string, Export> = {
  clients: {
    label: "Clients",
    run: async (orgId) => {
      const rows = await db.select().from(clients).where(and(eq(clients.orgId, orgId), isNull(clients.deletedAt))).orderBy(asc(clients.name));
      return { header: ["key", "code", "name", "status", "website", "phone", "created"], rows: rows.map((c) => [c.key, c.code, c.name, c.status, c.website, c.phone, c.createdAt]) };
    },
  },
  contacts: {
    label: "Client contacts",
    run: async (orgId) => {
      const rows = await db
        .select({ c: clientContacts, client: clients.key })
        .from(clientContacts)
        .innerJoin(clients, eq(clients.id, clientContacts.clientId))
        .where(and(eq(clientContacts.orgId, orgId), isNull(clientContacts.deletedAt)))
        .orderBy(asc(clients.key), asc(clientContacts.name));
      return {
        header: ["client", "name", "email", "phone", "primary", "approver", "billing", "portal_login"],
        rows: rows.map(({ c, client }) => [client, c.name, c.email, c.phone, c.isPrimary, c.isApprover, c.isBilling, Boolean(c.userId)]),
      };
    },
  },
  projects: {
    label: "Projects",
    run: async (orgId) => {
      const rows = await db
        .select({ p: projects, client: clients.key, pkg: packages.key, version: packageVersions.version })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .innerJoin(packageVersions, eq(packageVersions.id, projects.packageVersionId))
        .innerJoin(packages, eq(packages.id, packageVersions.packageId))
        .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)))
        .orderBy(asc(projects.key));
      return {
        header: ["key", "name", "client", "package", "status", "start", "target_launch", "completed", "created"],
        rows: rows.map(({ p, client, pkg, version }) => [p.key, p.name, client, `${pkg}-v${version}`, p.status, p.startDate, p.targetLaunchDate, p.completedAt, p.createdAt]),
      };
    },
  },
  tickets: {
    label: "Tickets",
    run: async (orgId) => {
      const rows = await db
        .select({ t: tickets, type: ticketTypes.name, status: ticketStatuses.name, priority: priorities.name, project: projects.key, client: clients.key, assignee: assignee.email })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .innerJoin(ticketStatuses, eq(ticketStatuses.id, tickets.statusId))
        .innerJoin(priorities, eq(priorities.id, tickets.priorityId))
        .leftJoin(projects, eq(projects.id, tickets.projectId))
        .leftJoin(clients, eq(clients.id, tickets.clientId))
        .leftJoin(memberships, eq(memberships.id, tickets.assigneeMembershipId))
        .leftJoin(assignee, eq(assignee.id, memberships.userId))
        .where(and(eq(tickets.orgId, orgId), isNull(tickets.deletedAt)))
        .orderBy(asc(tickets.number));
      return {
        header: ["key", "title", "type", "status", "priority", "project", "client", "assignee", "due", "estimate_minutes", "client_visible", "source", "created", "resolved"],
        rows: rows.map(({ t, ...x }) => [t.key, t.title, x.type, x.status, x.priority, x.project, x.client, x.assignee, t.dueAt, t.estimateMinutes, t.isClientVisible, t.source, t.createdAt, t.resolvedAt]),
      };
    },
  },
  leads: {
    label: "Leads",
    run: async (orgId) => {
      const rows = await db
        .select({ t: tickets, stage: leadStages.name, client: clients.key })
        .from(tickets)
        .leftJoin(leadStages, eq(leadStages.id, tickets.leadStageId))
        .leftJoin(clients, eq(clients.id, tickets.clientId))
        .where(and(eq(tickets.orgId, orgId), isNull(tickets.deletedAt), isNotNull(tickets.leadStageId)))
        .orderBy(asc(tickets.number));
      return {
        header: ["key", "name", "company", "email", "phone", "stage", "converted_to", "form_answers", "created"],
        rows: rows.map(({ t, stage, client }) => [t.key, t.leadContact?.name, t.leadContact?.company, t.leadContact?.email, t.leadContact?.phone, stage, client, t.formData, t.createdAt]),
      };
    },
  },
};
