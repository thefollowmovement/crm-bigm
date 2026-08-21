import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { commTasks, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { todayParis } from "@/lib/dates";
import {
  formatCommTaskNumber,
  isCommTaskLate,
} from "@/services/comm-tasks.service";
import { notify } from "@/services/notifications.service";

// Job quotidien : tâches communication dont l'échéance OU la date de
// publication est dépassée (cdc §19). Idempotent : dedupeKey par tâche +
// marqueur reminderSentAt.
export async function runCommTaskOverdueJob(now: Date = new Date()) {
  const today = todayParis(now);

  const candidates = await db.query.commTasks.findMany({
    where: and(
      inArray(commTasks.status, ["NOUVEAU", "AFFECTE", "EN_COURS", "EN_ATTENTE"]),
      isNull(commTasks.reminderSentAt)
    ),
  });
  const toRemind = candidates.filter((t) => isCommTaskLate(t, today));

  const pole = await db.query.users.findMany({
    where: and(eq(users.pole, "COMMUNICATION"), eq(users.isActive, true)),
    columns: { id: true },
  });

  let notified = 0;
  for (const task of toRemind) {
    const recipients = [
      ...(task.assigneeId ? [task.assigneeId] : []),
      task.requesterId,
      ...pole.map((u) => u.id),
    ];
    notified += await notify([...new Set(recipients)], {
      type: "COMMUNICATION",
      title: `Tâche ${formatCommTaskNumber(task.number)} en retard`,
      body: task.title,
      link: `/communication/${task.id}`,
      dedupeKey: `comm-task-overdue:${task.id}`,
    });

    await db
      .update(commTasks)
      .set({ reminderSentAt: now })
      .where(eq(commTasks.id, task.id));

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "comm_tasks",
      recordId: task.id,
      changes: { reminderSentAt: { old: null, new: now.toISOString() } },
    });
  }

  return { checked: candidates.length, reminded: toRemind.length, notified };
}
