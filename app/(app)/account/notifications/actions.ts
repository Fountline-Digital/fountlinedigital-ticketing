"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { audit } from "@/lib/audit";
import { CLIENT_EVENTS, PERSONAL_EVENTS } from "@/lib/notification-events";
import { requireUser } from "@/lib/session";

export type Prefs = Record<string, { inApp: boolean; email: boolean }>;

export async function savePreferences(prefs: Prefs): Promise<{ ok?: string; error?: string }> {
  const { user, membership } = await requireUser();
  const events = membership.role === "client" ? CLIENT_EVENTS : PERSONAL_EVENTS;
  const rows = events.filter((e) => prefs[e.key]).map((e) => ({
    membershipId: membership.id,
    eventKey: e.key,
    inApp: Boolean(prefs[e.key].inApp),
    email: Boolean(prefs[e.key].email),
  }));
  for (const r of rows) {
    await db
      .insert(notificationPreferences)
      .values(r)
      .onConflictDoUpdate({ target: [notificationPreferences.membershipId, notificationPreferences.eventKey], set: { inApp: r.inApp, email: r.email } });
  }
  await audit({ orgId: membership.orgId, actorUserId: user.id, actorRole: membership.role, action: "notifications.preferences", entityType: "membership", entityId: membership.id });
  revalidatePath("/account/notifications");
  revalidatePath("/portal/notifications/settings");
  return { ok: "Notification settings saved." };
}
