import "server-only";

import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  commTaskComments,
  commTasks,
  fileAttachments,
  partners,
  stores,
  users,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
} from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type TaskRow = typeof commTasks.$inferSelect;
type TaskStatus = TaskRow["status"];
type TaskType = TaskRow["type"];

export function formatCommTaskNumber(number: number): string {
  return `COM-${String(number).padStart(6, "0")}`;
}

// ── Décisions pures (testées en unit) ────────────────────────────

// Tout le siège et les franchisés peuvent DEMANDER ; les autres types de
// tâches (créations, campagnes…) restent au pôle communication.
export function canCreateCommTask(
  context: { hasWrite: boolean },
  type: TaskType
): boolean {
  if (context.hasWrite) return true;
  return type === "DEMANDE";
}

// Même machine à états que les tickets ; le demandeur (ou la direction)
// valide, et peut valider SANS commtask:write (il suit sa demande).
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NOUVEAU: ["AFFECTE"],
  AFFECTE: ["EN_COURS"],
  EN_COURS: ["EN_ATTENTE", "TERMINE"],
  EN_ATTENTE: ["EN_COURS"],
  TERMINE: ["VALIDE", "EN_COURS"],
  VALIDE: [],
};

export function canTransitionCommTask(
  current: TaskStatus,
  next: TaskStatus,
  context: { isRequester: boolean; hasWrite: boolean; role: SessionUser["role"] }
): { allowed: boolean; reason?: string } {
  if (!TRANSITIONS[current].includes(next)) {
    return { allowed: false, reason: `Transition ${current} → ${next} impossible.` };
  }
  if (next === "VALIDE") {
    const allowed =
      context.isRequester || context.role === "ADMIN" || context.role === "DIRECTION";
    if (!allowed) {
      return {
        allowed: false,
        reason: "Seul le demandeur (ou la direction) valide une tâche terminée.",
      };
    }
    return { allowed: true };
  }
  if (!context.hasWrite) {
    return {
      allowed: false,
      reason: "Seul le pôle communication fait avancer les tâches.",
    };
  }
  return { allowed: true };
}

// « En retard » : échéance OU date de publication dépassée — dérivé.
export function isCommTaskLate(
  task: Pick<TaskRow, "dueDate" | "publicationDate" | "status">,
  today: string
): boolean {
  if (task.status === "TERMINE" || task.status === "VALIDE") return false;
  const deadline =
    task.dueDate && task.publicationDate
      ? task.dueDate < task.publicationDate
        ? task.dueDate
        : task.publicationDate
      : (task.dueDate ?? task.publicationDate);
  if (!deadline) return false;
  return deadline < today;
}

// ── Lectures ─────────────────────────────────────────────────────

export type CommTaskFilters = {
  status?: TaskStatus;
  type?: TaskType;
  storeId?: string;
};

export async function listCommTasks(
  actor: SessionUser,
  filters: CommTaskFilters = {}
) {
  assertCan(actor, "commtask:read");
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(commTasks.status, filters.status));
  if (filters.type) conditions.push(eq(commTasks.type, filters.type));
  if (filters.storeId) conditions.push(eq(commTasks.storeId, filters.storeId));

  // Franchisé : les tâches de SES boutiques ou SES propres demandes.
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    const own = eq(commTasks.requesterId, actor.id);
    const cond =
      scoped.length > 0 ? or(inArray(commTasks.storeId, scoped), own) : own;
    if (cond) conditions.push(cond);
  }

  return db.query.commTasks.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(commTasks.createdAt)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      partner: { columns: { id: true, companyName: true } },
      requester: { columns: { id: true, firstName: true, lastName: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function getCommTask(actor: SessionUser, taskId: string) {
  assertCan(actor, "commtask:read");
  const task = await db.query.commTasks.findFirst({
    where: eq(commTasks.id, taskId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      partner: { columns: { id: true, companyName: true } },
      requester: { columns: { id: true, firstName: true, lastName: true } },
      assignee: { columns: { id: true, firstName: true, lastName: true } },
      comments: {
        orderBy: [commTaskComments.createdAt],
        with: { author: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!task) return null;

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    const allowed =
      task.requesterId === actor.id ||
      (task.storeId !== null && scoped.includes(task.storeId));
    if (!allowed) throw new ForbiddenError("Tâche hors de votre périmètre.");
  }

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "COMM_TASK"),
      eq(fileAttachments.entityId, taskId)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...task, attachments };
}

// Membres actifs du pôle communication (affectation).
export async function listCommMembers(actor: SessionUser) {
  assertCan(actor, "commtask:read");
  return db.query.users.findMany({
    where: and(eq(users.pole, "COMMUNICATION"), eq(users.isActive, true)),
    columns: { id: true, firstName: true, lastName: true },
  });
}

async function notifyCommPole(exceptUserId: string, payload: {
  title: string;
  body?: string;
  link: string;
}) {
  const members = await db.query.users.findMany({
    where: and(eq(users.pole, "COMMUNICATION"), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    members.map((m) => m.id).filter((id) => id !== exceptUserId),
    { type: "COMMUNICATION", ...payload }
  );
}

// ── Écritures ────────────────────────────────────────────────────

export async function createCommTask(
  actor: SessionUser,
  input: {
    type: TaskType;
    title: string;
    description: string | null;
    storeId: string | null;
    partnerId: string | null;
    priority: TaskRow["priority"];
    dueDate: string | null;
    publicationDate: string | null;
    files: File[];
  }
) {
  assertCan(actor, "commtask:request");
  const hasWrite = can(actor, "commtask:write");
  if (!canCreateCommTask({ hasWrite }, input.type)) {
    throw new ForbiddenError(
      "Seul le pôle communication crée ce type de tâche (les autres déposent des demandes)."
    );
  }
  if (input.storeId) {
    const scoped = await accessibleStoreIds(actor);
    if (scoped !== null && !scoped.includes(input.storeId)) {
      throw new ForbiddenError("Boutique hors de votre périmètre.");
    }
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, input.storeId),
      columns: { id: true },
    });
    if (!store) throw new Error("Boutique introuvable.");
  }
  if (input.partnerId) {
    const partner = await db.query.partners.findFirst({
      where: eq(partners.id, input.partnerId),
    });
    if (!partner || !partner.isActive) throw new Error("Partenaire introuvable.");
  }

  const task = await auditedInsert({ id: actor.id }, commTasks, {
    type: input.type,
    title: input.title,
    description: input.description,
    storeId: input.storeId,
    partnerId: input.partnerId,
    priority: input.priority,
    dueDate: input.dueDate,
    publicationDate: input.publicationDate,
    requesterId: actor.id,
  });
  for (const file of input.files) {
    await saveUpload(actor, file, { entityType: "COMM_TASK", entityId: task.id });
  }
  await notifyCommPole(actor.id, {
    title: `Nouvelle tâche ${formatCommTaskNumber(task.number)} : ${input.title}`,
    body: `De ${actor.firstName} ${actor.lastName}`,
    link: `/communication/${task.id}`,
  });
  return task;
}

export async function assignCommTask(
  actor: SessionUser,
  taskId: string,
  assigneeId: string
) {
  assertCan(actor, "commtask:write");
  const task = await db.query.commTasks.findFirst({ where: eq(commTasks.id, taskId) });
  if (!task) throw new Error("Tâche introuvable.");
  if (task.status === "VALIDE") throw new Error("Tâche déjà validée.");
  const assignee = await db.query.users.findFirst({ where: eq(users.id, assigneeId) });
  if (!assignee || !assignee.isActive) throw new Error("Responsable invalide.");

  const updated = await auditedUpdate({ id: actor.id }, commTasks, taskId, {
    assigneeId,
    status: task.status === "NOUVEAU" ? "AFFECTE" : task.status,
  });
  if (assigneeId !== actor.id) {
    await notify([assigneeId], {
      type: "COMMUNICATION",
      title: `Tâche ${formatCommTaskNumber(task.number)} affectée à vous`,
      body: task.title,
      link: `/communication/${taskId}`,
    });
  }
  return updated;
}

export async function transitionCommTask(
  actor: SessionUser,
  taskId: string,
  next: TaskStatus
) {
  assertCan(actor, "commtask:read");
  const task = await db.query.commTasks.findFirst({ where: eq(commTasks.id, taskId) });
  if (!task) throw new Error("Tâche introuvable.");

  const decision = canTransitionCommTask(task.status, next, {
    isRequester: task.requesterId === actor.id,
    hasWrite: can(actor, "commtask:write"),
    role: actor.role,
  });
  if (!decision.allowed) throw new ForbiddenError(decision.reason);

  const patch: Partial<typeof commTasks.$inferInsert> = { status: next };
  if (next === "TERMINE") patch.completedAt = new Date();
  if (next === "VALIDE") patch.validatedAt = new Date();
  if (next === "EN_COURS" && task.status === "TERMINE") patch.completedAt = null;

  const updated = await auditedUpdate({ id: actor.id }, commTasks, taskId, patch);

  if (next === "TERMINE" && task.requesterId !== actor.id) {
    await notify([task.requesterId], {
      type: "COMMUNICATION",
      title: `Tâche ${formatCommTaskNumber(task.number)} terminée — à valider`,
      body: task.title,
      link: `/communication/${taskId}`,
    });
  }
  return updated;
}

export async function addCommTaskComment(
  actor: SessionUser,
  taskId: string,
  body: string
) {
  assertCan(actor, "commtask:read");
  const task = await db.query.commTasks.findFirst({ where: eq(commTasks.id, taskId) });
  if (!task) throw new Error("Tâche introuvable.");
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    const allowed =
      task.requesterId === actor.id ||
      (task.storeId !== null && scoped.includes(task.storeId));
    if (!allowed) throw new ForbiddenError("Tâche hors de votre périmètre.");
  }

  const comment = await auditedInsert({ id: actor.id }, commTaskComments, {
    taskId,
    authorId: actor.id,
    body,
  });
  const recipients = [task.requesterId, task.assigneeId].filter(
    (id): id is string => id !== null && id !== actor.id
  );
  await notify(recipients, {
    type: "COMMUNICATION",
    title: `Nouveau commentaire sur ${formatCommTaskNumber(task.number)}`,
    body: body.slice(0, 120),
    link: `/communication/${taskId}`,
  });
  return comment;
}

