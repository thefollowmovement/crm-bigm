import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";

type NotificationType = (typeof notifications.$inferInsert)["type"];

// Crée une notification pour chaque destinataire. La dedupeKey rend l'appel
// rejouable : un couple (userId, dedupeKey) déjà présent est ignoré —
// c'est ce qui rend les jobs cron idempotents.
export async function notify(
  userIds: string[],
  input: {
    type: NotificationType;
    title: string;
    body?: string | null;
    link?: string | null;
    dedupeKey?: string | null;
  }
): Promise<number> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return 0;
  const rows = await db
    .insert(notifications)
    .values(
      unique.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        dedupeKey: input.dedupeKey ?? null,
      }))
    )
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return rows.length;
}

export async function unreadCount(actor: SessionUser): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return row.value;
}

export async function listNotifications(actor: SessionUser, limit = 50) {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, actor.id),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}

export async function markAsRead(actor: SessionUser, notificationId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.userId, actor.id))
    );
}

export async function markAllAsRead(actor: SessionUser) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}
