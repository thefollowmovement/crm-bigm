import "server-only";

import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  actionPlanComments,
  actionPlans,
  fileAttachments,
  stores,
  users,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type PlanRow = typeof actionPlans.$inferSelect;
type PlanStatus = PlanRow["status"];

export function formatPlanNumber(number: number): string {
  return `PA-${String(number).padStart(6, "0")}`;
}

// ── Machine à états (cdc §7 : responsable, échéance, statut, validation) ──
// A_FAIRE → EN_COURS → TERMINE → VALIDE ; réouverture TERMINE → EN_COURS ;
// annulation possible tant que le plan n'est pas terminé.
const PLAN_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  A_FAIRE: ["EN_COURS", "ANNULE"],
  EN_COURS: ["TERMINE", "ANNULE"],
  TERMINE: ["VALIDE", "EN_COURS"],
  VALIDE: [],
  ANNULE: [],
};

// Décision pure (testée en unit).
export function canTransitionPlan(
  current: PlanStatus,
  next: PlanStatus,
  context: { isCreator: boolean; role: SessionUser["role"] }
): { allowed: boolean; reason?: string } {
  if (!PLAN_TRANSITIONS[current].includes(next)) {
    return { allowed: false, reason: `Transition ${current} → ${next} impossible.` };
  }
  if (next === "VALIDE" || next === "ANNULE") {
    const allowed =
      context.isCreator || context.role === "ADMIN" || context.role === "DIRECTION";
    if (!allowed) {
      return {
        allowed: false,
        reason:
          next === "VALIDE"
            ? "Seul le créateur (ou la direction) valide un plan d'action."
            : "Seul le créateur (ou la direction) annule un plan d'action.",
      };
    }
  }
  return { allowed: true };
}

// « En retard » : dérivé, jamais stocké.
export function isPlanLate(
  plan: Pick<PlanRow, "dueDate" | "status">,
  today: string
): boolean {
  if (!plan.dueDate) return false;
  if (plan.status === "TERMINE" || plan.status === "VALIDE" || plan.status === "ANNULE")
    return false;
  return plan.dueDate < today;
}

// ── Lectures ─────────────────────────────────────────────────────

export type PlanFilters = {
  status?: PlanStatus;
  storeId?: string;
  assigneeId?: string;
};

export async function listPlans(actor: SessionUser, filters: PlanFilters = {}) {
  assertCan(actor, "actionplan:read");
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(actionPlans.status, filters.status));
  if (filters.storeId) conditions.push(eq(actionPlans.storeId, filters.storeId));
  if (filters.assigneeId) conditions.push(eq(actionPlans.assigneeId, filters.assigneeId));

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(actionPlans.storeId, scoped));
  }

  return db.query.actionPlans.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(actionPlans.createdAt)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function getPlan(actor: SessionUser, planId: string) {
  assertCan(actor, "actionplan:read");
  const plan = await db.query.actionPlans.findFirst({
    where: eq(actionPlans.id, planId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      visit: { columns: { id: true, type: true, visitDate: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
      comments: {
        orderBy: [actionPlanComments.createdAt],
        with: { author: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!plan) return null;
  await assertStoreAccess(actor, plan.storeId);

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "ACTION_PLAN"),
      eq(fileAttachments.entityId, plan.id)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...plan, attachments };
}

// Responsables possibles d'un plan : utilisateurs actifs du siège.
export async function listAssignableUsers(actor: SessionUser) {
  assertCan(actor, "actionplan:read");
  return db.query.users.findMany({
    where: and(
      eq(users.isActive, true),
      sql`${users.role} <> 'FRANCHISE'`
    ),
    columns: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [users.lastName],
  });
}

// ── Écritures ────────────────────────────────────────────────────

export async function createPlan(
  actor: SessionUser,
  input: {
    storeId: string;
    visitId: string | null;
    title: string;
    description: string | null;
    priority: PlanRow["priority"];
    assigneeId: string | null;
    dueDate: string | null;
    files: File[];
  }
) {
  assertCan(actor, "actionplan:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
    columns: { id: true, code: true },
  });
  if (!store) throw new Error("Boutique introuvable.");
  if (input.assigneeId) {
    const assignee = await db.query.users.findFirst({
      where: eq(users.id, input.assigneeId),
    });
    if (!assignee || !assignee.isActive) throw new Error("Responsable invalide.");
  }

  const plan = await auditedInsert({ id: actor.id }, actionPlans, {
    storeId: input.storeId,
    visitId: input.visitId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    assigneeId: input.assigneeId,
    createdById: actor.id,
    dueDate: input.dueDate,
  });
  for (const file of input.files) {
    await saveUpload(actor, file, { entityType: "ACTION_PLAN", entityId: plan.id });
  }
  if (input.assigneeId && input.assigneeId !== actor.id) {
    await notify([input.assigneeId], {
      type: "PLAN_ACTION",
      title: `Plan d'action ${formatPlanNumber(plan.number)} : ${input.title}`,
      body: `Boutique ${store.code}${input.dueDate ? ` — échéance ${input.dueDate}` : ""}`,
      link: `/animation/plans-action/${plan.id}`,
    });
  }
  return plan;
}

export async function assignPlan(
  actor: SessionUser,
  planId: string,
  assigneeId: string
) {
  assertCan(actor, "actionplan:write");
  const plan = await db.query.actionPlans.findFirst({
    where: eq(actionPlans.id, planId),
  });
  if (!plan) throw new Error("Plan d'action introuvable.");
  if (plan.status === "VALIDE" || plan.status === "ANNULE") {
    throw new Error("Plan d'action clos : plus modifiable.");
  }
  const assignee = await db.query.users.findFirst({ where: eq(users.id, assigneeId) });
  if (!assignee || !assignee.isActive) throw new Error("Responsable invalide.");

  const updated = await auditedUpdate({ id: actor.id }, actionPlans, planId, {
    assigneeId,
  });
  if (assigneeId !== actor.id) {
    await notify([assigneeId], {
      type: "PLAN_ACTION",
      title: `Plan d'action ${formatPlanNumber(plan.number)} affecté à vous`,
      body: plan.title,
      link: `/animation/plans-action/${planId}`,
    });
  }
  return updated;
}

export async function transitionPlan(
  actor: SessionUser,
  planId: string,
  next: PlanStatus
) {
  assertCan(actor, "actionplan:write");
  const plan = await db.query.actionPlans.findFirst({
    where: eq(actionPlans.id, planId),
  });
  if (!plan) throw new Error("Plan d'action introuvable.");

  const decision = canTransitionPlan(plan.status, next, {
    isCreator: plan.createdById === actor.id,
    role: actor.role,
  });
  if (!decision.allowed) throw new ForbiddenError(decision.reason);

  const patch: Partial<typeof actionPlans.$inferInsert> = { status: next };
  if (next === "TERMINE") patch.completedAt = new Date();
  if (next === "VALIDE") patch.validatedAt = new Date();
  if (next === "EN_COURS" && plan.status === "TERMINE") patch.completedAt = null;

  const updated = await auditedUpdate({ id: actor.id }, actionPlans, planId, patch);

  if (next === "TERMINE" && plan.createdById !== actor.id) {
    await notify([plan.createdById], {
      type: "PLAN_ACTION",
      title: `Plan d'action ${formatPlanNumber(plan.number)} terminé — à valider`,
      body: plan.title,
      link: `/animation/plans-action/${planId}`,
    });
  }
  return updated;
}

export async function addPlanComment(
  actor: SessionUser,
  planId: string,
  body: string
) {
  assertCan(actor, "actionplan:write");
  const plan = await db.query.actionPlans.findFirst({
    where: eq(actionPlans.id, planId),
  });
  if (!plan) throw new Error("Plan d'action introuvable.");

  const comment = await auditedInsert({ id: actor.id }, actionPlanComments, {
    planId,
    authorId: actor.id,
    body,
  });
  const recipients = [plan.createdById, plan.assigneeId].filter(
    (id): id is string => id !== null && id !== actor.id
  );
  await notify(recipients, {
    type: "PLAN_ACTION",
    title: `Nouveau commentaire sur ${formatPlanNumber(plan.number)}`,
    body: body.slice(0, 120),
    link: `/animation/plans-action/${planId}`,
  });
  return comment;
}
