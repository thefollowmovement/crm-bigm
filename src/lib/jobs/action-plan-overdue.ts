import "server-only";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { actionPlans } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatPlanNumber } from "@/services/action-plans.service";
import { notify } from "@/services/notifications.service";

type PlanRow = typeof actionPlans.$inferSelect;

// Décision pure (testée en unit) : ce plan doit-il déclencher la relance ?
export function shouldRemindPlan(
  plan: Pick<PlanRow, "status" | "dueDate" | "reminderSentAt">,
  today: string
): boolean {
  if (plan.status !== "A_FAIRE" && plan.status !== "EN_COURS") return false;
  if (!plan.dueDate) return false;
  if (plan.reminderSentAt) return false;
  return plan.dueDate < today;
}

// Job quotidien : relance des plans d'action dont l'échéance est dépassée.
// Idempotent : dedupeKey par plan + marqueur reminderSentAt.
export async function runActionPlanOverdueJob(now: Date = new Date()) {
  const today = todayParis(now);

  const candidates = await db.query.actionPlans.findMany({
    where: and(
      inArray(actionPlans.status, ["A_FAIRE", "EN_COURS"]),
      isNotNull(actionPlans.dueDate),
      isNull(actionPlans.reminderSentAt)
    ),
    with: {
      store: { columns: { id: true, code: true, name: true, animateurId: true } },
    },
  });

  const toRemind = candidates.filter((p) => shouldRemindPlan(p, today));
  let notified = 0;

  for (const plan of toRemind) {
    const recipients = [
      ...(plan.assigneeId ? [plan.assigneeId] : []),
      plan.createdById,
      ...(plan.store.animateurId ? [plan.store.animateurId] : []),
    ];

    notified += await notify(recipients, {
      type: "PLAN_ACTION",
      title: `Plan d'action ${formatPlanNumber(plan.number)} en retard`,
      body: `${plan.title} (${plan.store.code}) — échéance dépassée le ${formatDateFr(plan.dueDate)}.`,
      link: `/animation/plans-action/${plan.id}`,
      dedupeKey: `action-plan-overdue:${plan.id}`,
    });

    await db
      .update(actionPlans)
      .set({ reminderSentAt: now })
      .where(eq(actionPlans.id, plan.id));

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "action_plans",
      recordId: plan.id,
      changes: {
        reminderSentAt: { old: null, new: now.toISOString() },
      },
    });
  }

  return { checked: candidates.length, reminded: toRemind.length, notified };
}
