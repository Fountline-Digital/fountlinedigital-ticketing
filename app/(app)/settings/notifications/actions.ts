"use server";
import { revalidatePath } from "next/cache";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { discordWebhooks, notificationTemplates, notifications, organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/mfa";
import { DISCORD_EVENTS, NOTIFICATION_EVENTS } from "@/lib/notification-events";
import { deliverEmails, isDiscordWebhookUrl, notify, postToDiscord } from "@/lib/notify";
import { requirePermission } from "@/lib/session";

export type Result = { ok?: string; error?: string };
const PATH = "/settings/notifications";

const log = (ctx: Awaited<ReturnType<typeof requirePermission>>, action: string, entityId?: string, metadata?: Record<string, unknown>) =>
  audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action, entityType: "discord_webhook", entityId, metadata });

const cleanEvents = (events: string[]) => events.filter((e) => DISCORD_EVENTS.some((d) => d.key === e));

export async function saveEmailSettings(input: { senderName: string; replyTo: string }): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const replyTo = input.replyTo.trim();
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return { error: "Check the reply-to address." };
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const notificationsSettings = { ...org.settings.notifications, senderName: input.senderName.trim().slice(0, 60) || undefined, replyTo: replyTo || undefined };
  await db.update(organizations).set({ settings: { ...org.settings, notifications: notificationsSettings } }).where(eq(organizations.id, ctx.orgId));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.notifications", entityType: "organization", entityId: ctx.orgId, changes: { before: { ...org.settings.notifications }, after: notificationsSettings } });
  revalidatePath(PATH);
  return { ok: "Email settings saved." };
}

/** Sends a test notification to yourself (bell + email, whatever your settings are). */
export async function sendTestEmail(): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  await notify(db, {
    orgId: ctx.orgId,
    userIds: [ctx.user.id],
    eventKey: "ticket.assigned",
    title: "Test notification",
    body: "If you can read this, notifications are working.",
    url: "/settings/notifications",
  });
  return { ok: "Sent. Check the bell and your inbox (if email is on for “Assigned to me”)." };
}

export async function retryFailedEmails(): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const since = new Date(Date.now() - 7 * 86400_000);
  const failed = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.orgId, ctx.orgId), eq(notifications.emailStatus, "failed"), gte(notifications.createdAt, since)));
  if (failed.length === 0) return { ok: "Nothing to retry." };
  const ids = failed.map((f) => f.id);
  for (const id of ids) await db.update(notifications).set({ emailStatus: "pending" }).where(eq(notifications.id, id));
  await deliverEmails(ids);
  revalidatePath(PATH);
  return { ok: `Retried ${ids.length} email${ids.length === 1 ? "" : "s"}.` };
}

export async function addWebhook(input: { name: string; url: string; events: string[] }): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const name = input.name.trim();
  if (!name) return { error: "Give it a name, like the channel it posts to." };
  if (!isDiscordWebhookUrl(input.url)) return { error: "That isn't a Discord webhook link. It starts with https://discord.com/api/webhooks/" };
  const events = cleanEvents(input.events);
  if (events.length === 0) return { error: "Pick at least one event." };
  const [row] = await db.insert(discordWebhooks).values({ orgId: ctx.orgId, name, urlEncrypted: encryptSecret(input.url.trim()), events }).returning();
  await log(ctx, "discord.add", row.id, { name, events });
  revalidatePath(PATH);
  return { ok: `${name} added. Use Test to check it.` };
}

async function webhookFor(orgId: string, id: string) {
  const [h] = await db.select().from(discordWebhooks).where(and(eq(discordWebhooks.id, id), eq(discordWebhooks.orgId, orgId)));
  return h ?? null;
}

export async function updateWebhook(id: string, input: { name?: string; events?: string[]; isActive?: boolean; url?: string }): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const h = await webhookFor(ctx.orgId, id);
  if (!h) return { error: "Webhook not found." };
  const set: Partial<typeof discordWebhooks.$inferInsert> = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) return { error: "The name can't be empty." };
    set.name = input.name.trim();
  }
  if (input.events !== undefined) {
    const events = cleanEvents(input.events);
    if (events.length === 0) return { error: "Pick at least one event (or turn it off instead)." };
    set.events = events;
  }
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.url) {
    if (!isDiscordWebhookUrl(input.url)) return { error: "That isn't a Discord webhook link." };
    set.urlEncrypted = encryptSecret(input.url.trim());
  }
  await db.update(discordWebhooks).set(set).where(eq(discordWebhooks.id, h.id));
  await log(ctx, "discord.update", h.id, { name: set.name, events: set.events, isActive: set.isActive, urlChanged: Boolean(input.url) });
  revalidatePath(PATH);
  return { ok: input.isActive === false ? `${h.name} paused.` : input.isActive ? `${h.name} turned on.` : "Saved." };
}

export async function testWebhook(id: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const h = await webhookFor(ctx.orgId, id);
  if (!h) return { error: "Webhook not found." };
  try {
    await postToDiscord(decryptSecret(h.urlEncrypted), { title: "Test from the Fountline portal", body: `${ctx.user.name || ctx.user.email} sent this from Settings.`, url: PATH });
    return { ok: "Posted. Check the Discord channel." };
  } catch (err) {
    return { error: `Discord didn't accept it (${err instanceof Error ? err.message : "error"}). The webhook may have been deleted in Discord.` };
  }
}

export async function deleteWebhook(id: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  const h = await webhookFor(ctx.orgId, id);
  if (!h) return { error: "Webhook not found." };
  await db.delete(discordWebhooks).where(eq(discordWebhooks.id, h.id));
  await log(ctx, "discord.delete", h.id, { name: h.name });
  revalidatePath(PATH);
  return { ok: `${h.name} removed.` };
}

// ---------------------------------------------------------------------------
// Email wording per event
// ---------------------------------------------------------------------------

export async function saveTemplate(eventKey: string, subject: string, body: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  if (!NOTIFICATION_EVENTS.some((e) => e.key === eventKey)) return { error: "Unknown event." };
  const s = subject.trim().slice(0, 200);
  const b = body.trim().slice(0, 5000);
  if (!s) return { error: "The subject can't be empty." };
  await db
    .insert(notificationTemplates)
    .values({ orgId: ctx.orgId, eventKey, subject: s, body: b })
    .onConflictDoUpdate({ target: [notificationTemplates.orgId, notificationTemplates.eventKey], set: { subject: s, body: b } });
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.email_template", entityType: "notification_template", metadata: { eventKey, subject: s } });
  revalidatePath(PATH);
  return { ok: "Saved. New emails for this event use it." };
}

export async function resetTemplate(eventKey: string): Promise<Result> {
  const ctx = await requirePermission("settings.manage");
  await db.delete(notificationTemplates).where(and(eq(notificationTemplates.orgId, ctx.orgId), eq(notificationTemplates.eventKey, eventKey)));
  await audit({ orgId: ctx.orgId, actorUserId: ctx.user.id, actorRole: ctx.role, action: "settings.email_template_reset", entityType: "notification_template", metadata: { eventKey } });
  revalidatePath(PATH);
  return { ok: "Back to the standard wording." };
}
