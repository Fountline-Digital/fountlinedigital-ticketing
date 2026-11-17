import "server-only";
import { and, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, clients, comments, files, organizations, tickets, users } from "@/db/schema";
import { deleteObject } from "@/lib/storage";

// Deleted things stay here (restorable) for the org's trashRetentionDays, default 30,
// then the nightly job deletes them for good. Admins can also delete forever sooner.

export const TRASH_KINDS = ["ticket", "comment", "file", "contact"] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];
export const KIND_LABELS: Record<TrashKind, string> = { ticket: "Ticket", comment: "Comment", file: "File", contact: "Client contact" };

export const retentionDays = (settings: { trashRetentionDays?: number }) => settings.trashRetentionDays ?? 30;

export type TrashItem = {
  kind: TrashKind;
  id: string;
  label: string;
  detail: string;
  href: string | null;
  deletedAt: Date;
  deletedBy: string | null;
  blockedReason: string | null; // why it can't be restored on its own
};

export async function listTrash(orgId: string): Promise<TrashItem[]> {
  const deleter = new Map<string, string>();
  const nameOf = async (ids: (string | null)[]) => {
    const missing = [...new Set(ids.filter((id): id is string => Boolean(id) && !deleter.has(id as string)))];
    if (missing.length === 0) return;
    for (const u of await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, missing))) {
      deleter.set(u.id, u.name || u.email);
    }
  };

  const [t, c, f, k] = await Promise.all([
    db.select().from(tickets).where(and(eq(tickets.orgId, orgId), isNotNull(tickets.deletedAt))),
    db
      .select({ c: comments, ticketKey: tickets.key, ticketDeleted: tickets.deletedAt })
      .from(comments)
      .innerJoin(tickets, eq(tickets.id, comments.ticketId))
      .where(and(eq(comments.orgId, orgId), isNotNull(comments.deletedAt))),
    db
      .select({ f: files, ticketKey: tickets.key, ticketDeleted: tickets.deletedAt })
      .from(files)
      .leftJoin(tickets, eq(tickets.id, files.ticketId))
      .where(and(eq(files.orgId, orgId), isNotNull(files.deletedAt))),
    db
      .select({ k: clientContacts, clientName: clients.name, clientId: clients.id })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(eq(clientContacts.orgId, orgId), isNotNull(clientContacts.deletedAt))),
  ]);
  await nameOf([...t.map((x) => x.deletedBy), ...c.map((x) => x.c.deletedBy), ...f.map((x) => x.f.deletedBy), ...k.map((x) => x.k.deletedBy)]);
  const by = (id: string | null) => (id ? deleter.get(id) ?? "Unknown" : null);

  const items: TrashItem[] = [
    ...t.map((x) => ({ kind: "ticket" as const, id: x.id, label: `${x.key} · ${x.title}`, detail: "", href: null, deletedAt: x.deletedAt!, deletedBy: by(x.deletedBy), blockedReason: null })),
    ...c.map(({ c, ticketKey, ticketDeleted }) => ({
      kind: "comment" as const,
      id: c.id,
      label: c.body.length > 120 ? `${c.body.slice(0, 120)}…` : c.body,
      detail: `on ${ticketKey}`,
      href: ticketDeleted ? null : `/tickets/${ticketKey}`,
      deletedAt: c.deletedAt!,
      deletedBy: by(c.deletedBy),
      blockedReason: ticketDeleted ? `Restore ${ticketKey} first.` : null,
    })),
    ...f.map(({ f, ticketKey, ticketDeleted }) => ({
      kind: "file" as const,
      id: f.id,
      label: f.originalName,
      detail: ticketKey ? `on ${ticketKey}` : f.projectId ? "project file" : "",
      href: ticketKey && !ticketDeleted ? `/tickets/${ticketKey}` : f.projectId ? `/projects/${f.projectId}` : null,
      deletedAt: f.deletedAt!,
      deletedBy: by(f.deletedBy),
      blockedReason: ticketDeleted ? `Restore ${ticketKey} first.` : null,
    })),
    ...k.map(({ k, clientName, clientId }) => ({
      kind: "contact" as const,
      id: k.id,
      label: `${k.name} <${k.email}>`,
      detail: clientName,
      href: `/clients/${clientId}`,
      deletedAt: k.deletedAt!,
      deletedBy: by(k.deletedBy),
      blockedReason: null,
    })),
  ];
  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

// All four share id / orgId / deletedAt / deletedBy, so one shape covers them for these queries.
const tables = { ticket: tickets, comment: comments, file: files, contact: clientContacts } as const;
const tableFor = (kind: TrashKind) => tables[kind] as unknown as typeof comments;

/** Finds a deleted row of this kind in this org. */
export async function trashedRow(orgId: string, kind: TrashKind, id: string) {
  const table = tableFor(kind);
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.orgId, orgId), isNotNull(table.deletedAt)));
  return (row as unknown as ({ id: string; deletedAt: Date } & Record<string, unknown>) | undefined) ?? null;
}

export async function restore(kind: TrashKind, id: string) {
  const table = tableFor(kind);
  await db.update(table).set({ deletedAt: null, deletedBy: null }).where(eq(table.id, id));
}

/** Deletes for good, including stored files in R2. A ticket takes its files with it. */
export async function purge(kind: TrashKind, id: string) {
  if (kind === "file" || kind === "ticket") {
    const stored = await db
      .select({ id: files.id, key: files.storageKey })
      .from(files)
      .where(kind === "file" ? eq(files.id, id) : eq(files.ticketId, id));
    for (const f of stored) {
      await deleteObject(f.key).catch((err) => console.error("[trash] R2 delete failed", f.key, err));
    }
    if (stored.length) await db.delete(files).where(inArray(files.id, stored.map((f) => f.id)));
  }
  if (kind !== "file") await db.delete(tableFor(kind)).where(eq(tableFor(kind).id, id));
}

/** Everything past the retention period, for the nightly job. Returns how many were purged. */
export async function purgeExpired(orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const cutoff = new Date(Date.now() - retentionDays(org.settings) * 86400_000);
  let n = 0;
  // Tickets first (they take their files and comments with them)
  for (const kind of ["ticket", "comment", "file", "contact"] as const) {
    const table = tableFor(kind);
    const old = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.orgId, orgId), isNotNull(table.deletedAt), lt(table.deletedAt, cutoff)))
      .orderBy(desc(table.deletedAt));
    for (const r of old) {
      await purge(kind, r.id);
      n++;
    }
  }
  return n;
}
