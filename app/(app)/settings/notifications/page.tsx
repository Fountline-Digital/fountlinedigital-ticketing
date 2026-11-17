import { and, asc, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { discordWebhooks, notificationTemplates, notifications, organizations } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { CLIENT_EVENTS, DISCORD_EVENTS, PERSONAL_EVENTS } from "@/lib/notification-events";
import { requirePermission } from "@/lib/session";
import { DiscordCard, EmailCard } from "./notification-settings";
import { EmailTemplates } from "./email-templates";

export default async function NotificationSettingsPage() {
  const ctx = await requirePermission("settings.manage");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const hooks = await db.select().from(discordWebhooks).where(eq(discordWebhooks.orgId, ctx.orgId)).orderBy(asc(discordWebhooks.createdAt));

  const templates = await db.select().from(notificationTemplates).where(eq(notificationTemplates.orgId, ctx.orgId));
  const since = new Date(Date.now() - 7 * 86400_000);
  const stats = await db
    .select({ status: notifications.emailStatus, n: count() })
    .from(notifications)
    .where(and(eq(notifications.orgId, ctx.orgId), gte(notifications.createdAt, since)))
    .groupBy(notifications.emailStatus);
  const stat = (s: string) => stats.find((x) => x.status === s)?.n ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Notifications"
        description="How the portal emails people and posts to Discord. Each person picks their own events under My notification settings."
      />
      <EmailCard
        senderName={org.settings.notifications?.senderName ?? ""}
        replyTo={org.settings.notifications?.replyTo ?? ""}
        stats={{ sent: stat("sent"), pending: stat("pending"), failed: stat("failed") }}
      />
      <EmailTemplates
        events={[...PERSONAL_EVENTS.map((e) => ({ ...e, audience: "Team" as const })), ...CLIENT_EVENTS.map((e) => ({ ...e, audience: "Clients" as const }))].map((e) => {
          const t = templates.find((x) => x.eventKey === e.key);
          return { key: e.key, label: e.label, audience: e.audience, subject: t?.subject ?? null, body: t?.body ?? null };
        })}
      />
      <DiscordCard
        events={DISCORD_EVENTS.map((e) => ({ value: e.key, label: e.label, hint: e.description }))}
        hooks={hooks.map((h) => ({ id: h.id, name: h.name, events: h.events, isActive: h.isActive }))}
      />
    </div>
  );
}
