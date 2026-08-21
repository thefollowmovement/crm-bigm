import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { openingProjects, openingSteps, users } from "@/db/schema";
import { logAuditEvent } from "@/lib/audit/log";
import { todayParis } from "@/lib/dates";
import { OPENING_STEP_TYPE_LABELS } from "@/lib/labels";
import { isStepLate } from "@/services/openings.service";
import { notify } from "@/services/notifications.service";

// Job quotidien : jalons d'ouverture dont la date prévue est dépassée sans
// être terminés (cdc §13). Idempotent : dedupeKey par jalon + marqueur
// lateAlertSentAt.
export async function runOpeningLateJob(now: Date = new Date()) {
  const today = todayParis(now);

  const activeProjects = await db.query.openingProjects.findMany({
    where: eq(openingProjects.status, "EN_COURS"),
    columns: { id: true, createdById: true },
    with: { store: { columns: { code: true, name: true } } },
  });
  const byProject = new Map(activeProjects.map((p) => [p.id, p]));

  const candidates =
    activeProjects.length === 0
      ? []
      : await db.query.openingSteps.findMany({
          where: and(
            inArray(
              openingSteps.projectId,
              activeProjects.map((p) => p.id)
            ),
            ne(openingSteps.status, "TERMINEE"),
            isNull(openingSteps.lateAlertSentAt)
          ),
        });
  const late = candidates.filter((s) => isStepLate(s, today));

  const pole = await db.query.users.findMany({
    where: and(eq(users.pole, "DEVELOPPEMENT"), eq(users.isActive, true)),
    columns: { id: true },
  });

  let notified = 0;
  for (const step of late) {
    const project = byProject.get(step.projectId);
    if (!project) continue;
    const recipients = [project.createdById, ...pole.map((u) => u.id)];
    notified += await notify([...new Set(recipients)], {
      type: "OUVERTURE",
      title: `Ouverture ${project.store.code} : jalon en retard`,
      body: `${OPENING_STEP_TYPE_LABELS[step.step]} — prévu le ${step.plannedDate}`,
      link: `/developpement/ouvertures/${step.projectId}`,
      dedupeKey: `opening-late:${step.id}`,
    });

    await db
      .update(openingSteps)
      .set({ lateAlertSentAt: now })
      .where(eq(openingSteps.id, step.id));

    await logAuditEvent({
      userId: null,
      action: "UPDATE",
      tableName: "opening_steps",
      recordId: step.id,
      changes: { lateAlertSentAt: { old: null, new: now.toISOString() } },
    });
  }

  return { checked: candidates.length, late: late.length, notified };
}
