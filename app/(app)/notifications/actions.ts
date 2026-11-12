"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/session";

export async function markNotificationRead(id: string) {
  const { user } = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.recipientUserId, user.id), isNull(notifications.readAt)));
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const { user, membership } = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientUserId, user.id), eq(notifications.orgId, membership.orgId), isNull(notifications.readAt)));
  revalidatePath("/dashboard");
}
