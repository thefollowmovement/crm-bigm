import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  fileAttachments,
  openingChecklistItems,
  openingProjects,
  openingSteps,
  stores,
} from "@/db/schema";
import { saveUpload } from "@/lib/files/storage";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertStoreAccess,
  assertCan,
} from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";

type ProjectRow = typeof openingProjects.$inferSelect;
type StepRow = typeof openingSteps.$inferSelect;
type StepType = StepRow["step"];
type StepStatus = StepRow["status"];
type ChecklistRow = typeof openingChecklistItems.$inferSelect;

// Ordre canonique des 8 jalons (cdc §13) — générés à la création du projet.
export const STEP_ORDER: readonly StepType[] = [
  "DIP",
  "CONTRAT",
  "TRAVAUX",
  "FORMATION",
  "COMMANDES",
  "INSTALLATION",
  "OUVERTURE",
  "SUIVI_J30",
];

// ── Décisions pures (testées en unit) ────────────────────────────

const STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  A_VENIR: ["EN_COURS", "BLOQUEE"],
  EN_COURS: ["TERMINEE", "BLOQUEE", "A_VENIR"],
  BLOQUEE: ["EN_COURS", "A_VENIR"],
  TERMINEE: ["EN_COURS"], // réouverture
};

export function canTransitionStep(
  current: StepStatus,
  next: StepStatus
): { allowed: boolean; reason?: string } {
  if (!STEP_TRANSITIONS[current].includes(next)) {
    return { allowed: false, reason: `Transition ${current} → ${next} impossible.` };
  }
  return { allowed: true };
}

// « en retard » : date prévue dépassée et jalon non terminé — dérivé.
export function isStepLate(
  step: Pick<StepRow, "plannedDate" | "status">,
  today: string
): boolean {
  if (step.status === "TERMINEE") return false;
  return step.plannedDate !== null && step.plannedDate < today;
}

export function computeProgress(steps: Pick<StepRow, "status">[]): {
  done: number;
  total: number;
  pct: number;
} {
  const done = steps.filter((s) => s.status === "TERMINEE").length;
  const total = steps.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

// Checklist collaborative : chaque pôle gère SES items ; opening:write gère tout.
export function canUpdateChecklistItem(
  context: { pole: SessionUser["pole"]; hasWrite: boolean },
  itemPole: ChecklistRow["pole"]
): boolean {
  if (context.hasWrite) return true;
  return context.pole !== null && context.pole === itemPole;
}

// ── Lectures ─────────────────────────────────────────────────────

function sortSteps<T extends { step: StepType }>(steps: T[]): T[] {
  return [...steps].sort(
    (a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step)
  );
}

export async function listProjects(actor: SessionUser) {
  assertCan(actor, "opening:read");
  const scoped = await accessibleStoreIds(actor);
  const rows = await db.query.openingProjects.findMany({
    with: {
      store: { columns: { id: true, code: true, name: true, city: true } },
      steps: { columns: { step: true, status: true, plannedDate: true } },
    },
    orderBy: [desc(openingProjects.createdAt)],
  });
  const visible =
    scoped === null ? rows : rows.filter((p) => scoped.includes(p.storeId));
  return visible.map((p) => ({
    ...p,
    steps: sortSteps(p.steps),
    progress: computeProgress(p.steps),
  }));
}

export async function getProject(actor: SessionUser, id: string) {
  assertCan(actor, "opening:read");
  const project = await db.query.openingProjects.findFirst({
    where: eq(openingProjects.id, id),
    with: {
      store: { columns: { id: true, code: true, name: true, city: true, status: true } },
      createdBy: { columns: { firstName: true, lastName: true } },
      steps: true,
      checklistItems: {
        with: { assignee: { columns: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!project) return null;
  await assertStoreAccess(actor, project.storeId);

  const attachments =
    project.steps.length === 0
      ? []
      : await db.query.fileAttachments.findMany({
          where: and(
            eq(fileAttachments.entityType, "OPENING_STEP"),
            inArray(
              fileAttachments.entityId,
              project.steps.map((s) => s.id)
            )
          ),
          columns: { id: true, originalName: true, entityId: true },
        });

  return {
    ...project,
    steps: sortSteps(project.steps).map((step) => ({
      ...step,
      attachments: attachments.filter((a) => a.entityId === step.id),
    })),
    progress: computeProgress(project.steps),
  };
}

// Bandeau de la fiche boutique.
export async function getProjectForStore(actor: SessionUser, storeId: string) {
  if (!can(actor, "opening:read")) return null;
  const project = await db.query.openingProjects.findFirst({
    where: eq(openingProjects.storeId, storeId),
    with: { steps: { columns: { step: true, status: true } } },
  });
  if (!project) return null;
  return { ...project, progress: computeProgress(project.steps) };
}

// ── Écritures ────────────────────────────────────────────────────

export async function createProject(
  actor: SessionUser,
  input: { storeId: string; targetOpeningDate: string | null; notes: string | null }
): Promise<ProjectRow> {
  assertCan(actor, "opening:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });
  if (!store) throw new Error("Boutique introuvable.");
  if (store.type !== "FRANCHISE" || store.status !== "EN_PROJET") {
    throw new Error(
      "Un projet d'ouverture ne se crée que pour une franchise EN PROJET."
    );
  }
  const existing = await db.query.openingProjects.findFirst({
    where: eq(openingProjects.storeId, input.storeId),
  });
  if (existing) throw new Error("Cette boutique a déjà un projet d'ouverture.");

  const project = await auditedInsert({ id: actor.id }, openingProjects, {
    storeId: input.storeId,
    targetOpeningDate: input.targetOpeningDate,
    notes: input.notes,
    createdById: actor.id,
  });
  for (const step of STEP_ORDER) {
    await auditedInsert({ id: actor.id }, openingSteps, {
      projectId: project.id,
      step,
    });
  }
  return project;
}

export async function updateProject(
  actor: SessionUser,
  id: string,
  input: {
    status: ProjectRow["status"];
    targetOpeningDate: string | null;
    notes: string | null;
  }
) {
  assertCan(actor, "opening:write");
  const project = await db.query.openingProjects.findFirst({
    where: eq(openingProjects.id, id),
  });
  if (!project) throw new Error("Projet introuvable.");
  return auditedUpdate({ id: actor.id }, openingProjects, id, { ...input });
}

export async function updateStep(
  actor: SessionUser,
  stepId: string,
  input: { plannedDate: string | null; notes: string | null }
) {
  assertCan(actor, "opening:write");
  const step = await db.query.openingSteps.findFirst({
    where: eq(openingSteps.id, stepId),
  });
  if (!step) throw new Error("Jalon introuvable.");
  return auditedUpdate({ id: actor.id }, openingSteps, stepId, { ...input });
}

export async function transitionStep(
  actor: SessionUser,
  stepId: string,
  next: StepStatus
) {
  assertCan(actor, "opening:write");
  const step = await db.query.openingSteps.findFirst({
    where: eq(openingSteps.id, stepId),
  });
  if (!step) throw new Error("Jalon introuvable.");
  const decision = canTransitionStep(step.status, next);
  if (!decision.allowed) throw new ForbiddenError(decision.reason);

  return auditedUpdate({ id: actor.id }, openingSteps, stepId, {
    status: next,
    // TERMINEE ⇒ date de réalisation ; réouverture ⇒ on l'efface.
    doneDate: next === "TERMINEE" ? todayParis() : null,
  });
}

export async function attachStepFiles(
  actor: SessionUser,
  stepId: string,
  files: File[]
) {
  assertCan(actor, "opening:write");
  const step = await db.query.openingSteps.findFirst({
    where: eq(openingSteps.id, stepId),
  });
  if (!step) throw new Error("Jalon introuvable.");
  for (const file of files) {
    await saveUpload(actor, file, { entityType: "OPENING_STEP", entityId: stepId });
  }
}

// ── Checklist ────────────────────────────────────────────────────

function assertChecklistRight(actor: SessionUser, itemPole: ChecklistRow["pole"]) {
  assertCan(actor, "opening:checklist");
  const allowed = canUpdateChecklistItem(
    { pole: actor.pole, hasWrite: can(actor, "opening:write") },
    itemPole
  );
  if (!allowed) {
    throw new ForbiddenError("Chaque pôle ne gère que ses propres items.");
  }
}

export async function addChecklistItem(
  actor: SessionUser,
  projectId: string,
  input: {
    label: string;
    pole: ChecklistRow["pole"];
    assigneeId: string | null;
    dueDate: string | null;
  }
) {
  assertChecklistRight(actor, input.pole);
  const project = await db.query.openingProjects.findFirst({
    where: eq(openingProjects.id, projectId),
  });
  if (!project) throw new Error("Projet introuvable.");
  return auditedInsert({ id: actor.id }, openingChecklistItems, {
    projectId,
    ...input,
  });
}

export async function setChecklistItemStatus(
  actor: SessionUser,
  itemId: string,
  status: ChecklistRow["status"]
) {
  const item = await db.query.openingChecklistItems.findFirst({
    where: eq(openingChecklistItems.id, itemId),
  });
  if (!item) throw new Error("Item introuvable.");
  assertChecklistRight(actor, item.pole);
  return auditedUpdate({ id: actor.id }, openingChecklistItems, itemId, {
    status,
    doneAt: status === "TERMINE" ? new Date() : null,
  });
}

export async function deleteChecklistItem(actor: SessionUser, itemId: string) {
  const item = await db.query.openingChecklistItems.findFirst({
    where: eq(openingChecklistItems.id, itemId),
  });
  if (!item) throw new Error("Item introuvable.");
  assertChecklistRight(actor, item.pole);
  await auditedDelete({ id: actor.id }, openingChecklistItems, itemId);
}
