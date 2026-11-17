import "server-only";
import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discordWebhooks, memberships, notificationPreferences, notificationTemplates, notifications, organizations, tickets, users } from "@/db/schema";
import { notificationEmail, sendEmail } from "@/lib/email";
import { decryptSecret } from "@/lib/mfa";
import { eventByKey, type EventKey } from "@/lib/notification-events";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = typeof db | Tx;

/** Runs work after the response is sent (falls back to running now outside a request, e.g. scheduled jobs). */
function later(fn: () => Promise<unknown>) {
  const safe = () =>
    fn().catch((err) => {
      console.error("[notify]", err);
      Sentry.captureException(err, { tags: { area: "notifications" } });
    });
  try {
    after(safe);
  } catch {
    void safe();
  }
}

const appUrl = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Sends one notification to each person, by their preferences: in the bell (in-app)
 * and/or by email. Safe inside a transaction: emails go out after the response, and
 * only for rows that were actually saved.
 */
export async function notify(
  q: Q,
  n: {
    orgId: string;
    userIds: (string | null | undefined)[];
    eventKey: EventKey;
    title: string;
    body?: string | null;
    url?: string | null;
    ticketId?: string | null;
    exceptUserId?: string; // usually whoever did the thing
  },
) {
  const ids = [...new Set(n.userIds.filter((id): id is string => Boolean(id) && id !== n.exceptUserId))];
  if (ids.length === 0) return;
  const event = eventByKey(n.eventKey);

  // Only active members of this org, with their saved preferences for this event
  const people = await q
    .select({ userId: memberships.userId, inApp: notificationPreferences.inApp, email: notificationPreferences.email })
    .from(memberships)
    .leftJoin(
      notificationPreferences,
      and(eq(notificationPreferences.membershipId, memberships.id), eq(notificationPreferences.eventKey, n.eventKey)),
    )
    .where(and(eq(memberships.orgId, n.orgId), eq(memberships.status, "active"), inArray(memberships.userId, ids)));

  const rows = people
    .map((p) => ({ userId: p.userId, inApp: p.inApp ?? true, email: p.email ?? event?.email ?? false }))
    .filter((p) => p.inApp || p.email)
    .map((p) => ({
      orgId: n.orgId,
      recipientUserId: p.userId,
      eventKey: n.eventKey,
      title: n.title,
      body: n.body ?? null,
      url: n.url ?? null,
      ticketId: n.ticketId ?? null,
      inApp: p.inApp,
      emailStatus: p.email ? "pending" : null,
    }));
  if (rows.length === 0) return;

  const saved = await q.insert(notifications).values(rows).returning({ id: notifications.id, emailStatus: notifications.emailStatus });
  const toEmail = saved.filter((r) => r.emailStatus === "pending").map((r) => r.id);
  if (toEmail.length > 0) later(() => deliverEmails(toEmail));
}

/** Sends pending notification emails (also used by the scheduled retry job). */
export async function deliverEmails(ids: string[]) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ n: notifications, email: users.email, name: users.name, org: organizations, ticketKey: tickets.key, role: memberships.role })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.recipientUserId))
    .innerJoin(organizations, eq(organizations.id, notifications.orgId))
    .leftJoin(tickets, eq(tickets.id, notifications.ticketId))
    .leftJoin(memberships, and(eq(memberships.userId, notifications.recipientUserId), eq(memberships.orgId, notifications.orgId)))
    .where(and(inArray(notifications.id, ids), eq(notifications.emailStatus, "pending")));
  // Custom wording per event (Settings > Notifications > Email wording)
  const orgIds = [...new Set(rows.map((r) => r.org.id))];
  const templates = orgIds.length ? await db.select().from(notificationTemplates).where(inArray(notificationTemplates.orgId, orgIds)) : [];

  for (const { n, email, name, org, ticketKey, role } of rows) {
    try {
      const link = n.url ? `${appUrl()}${n.url}` : role === "client" ? `${appUrl()}/portal` : `${appUrl()}/dashboard`;
      const values: Record<string, string> = {
        recipient_name: (name || email).split(" ")[0],
        title: n.title,
        details: n.body ?? "",
        link,
        org_name: org.name,
        ticket_key: ticketKey ?? "",
      };
      const fill = (t: string) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? values[k] : m));
      const tpl = templates.find((t) => t.orgId === org.id && t.eventKey === n.eventKey);
      await sendEmail(
        email,
        (tpl ? fill(tpl.subject) : n.title).slice(0, 200),
        notificationEmail({
          orgName: org.name,
          title: tpl ? fill(tpl.subject) : n.title,
          body: tpl ? fill(tpl.body) : n.body,
          link,
          preferencesLink: role === "client" ? `${appUrl()}/portal/notifications/settings` : `${appUrl()}/account/notifications`,
        }),
        { senderName: org.settings.notifications?.senderName, replyTo: org.settings.notifications?.replyTo },
      );
      await db.update(notifications).set({ emailStatus: "sent", emailedAt: new Date() }).where(eq(notifications.id, n.id));
    } catch (err) {
      console.error("[notify] email failed", n.id, err);
      Sentry.captureException(err, { tags: { area: "email" } });
      await db.update(notifications).set({ emailStatus: "failed" }).where(eq(notifications.id, n.id));
    }
  }
}

/** Posts to every active Discord webhook subscribed to this event. Never throws. */
export function announce(orgId: string, eventKey: EventKey, msg: { title: string; body?: string | null; url?: string | null }) {
  later(async () => {
    const hooks = await db
      .select()
      .from(discordWebhooks)
      .where(and(eq(discordWebhooks.orgId, orgId), eq(discordWebhooks.isActive, true)));
    for (const h of hooks.filter((h) => h.events.includes(eventKey))) {
      await postToDiscord(decryptSecret(h.urlEncrypted), msg).catch((err) => console.error("[discord]", h.name, err));
    }
  });
}

export async function postToDiscord(webhookUrl: string, msg: { title: string; body?: string | null; url?: string | null }) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      allowed_mentions: { parse: [] }, // never ping @everyone from ticket text
      embeds: [
        {
          title: msg.title.slice(0, 256),
          description: msg.body?.slice(0, 2000) || undefined,
          url: msg.url ? `${appUrl()}${msg.url}` : undefined,
          color: 0xc0c0c0,
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Discord answered ${res.status}`);
}

export const isDiscordWebhookUrl = (url: string) =>
  /^https:\/\/(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url.trim());
