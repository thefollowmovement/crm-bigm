import "server-only";

import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  fileAttachments,
  stores,
  trainingDocuments,
  trainingParticipants,
  trainings,
  users,
} from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type TrainingRow = typeof trainings.$inferSelect;
type TrainingStatus = TrainingRow["status"];

// ── Machine à états (cdc §9 : compte rendu, documents, validation) ──
const TRAINING_TRANSITIONS: Record<TrainingStatus, TrainingStatus[]> = {
  PLANIFIEE: ["REALISEE", "ANNULEE"],
  REALISEE: ["VALIDEE"],
  VALIDEE: [],
  ANNULEE: [],
};

// Décision pure (testée en unit). REALISEE exige un compte rendu ;
// la validation revient à la direction ou à la RH (pas au formateur seul).
export function canTransitionTraining(
  current: TrainingStatus,
  next: TrainingStatus,
  context: { hasReport: boolean; isTrainer: boolean; role: SessionUser["role"] }
): { allowed: boolean; reason?: string } {
  if (!TRAINING_TRANSITIONS[current].includes(next)) {
    return { allowed: false, reason: `Transition ${current} → ${next} impossible.` };
  }
  if (next === "REALISEE" && !context.hasReport) {
    return {
      allowed: false,
      reason: "Le compte rendu est obligatoire pour marquer la formation réalisée.",
    };
  }
  if (next === "VALIDEE") {
    const allowed =
      context.role === "ADMIN" || context.role === "DIRECTION" || context.role === "RH";
    if (!allowed) {
      return {
        allowed: false,
        reason: "Seule la direction ou la RH valide une formation réalisée.",
      };
    }
  }
  if (next === "ANNULEE") {
    const allowed =
      context.isTrainer ||
      context.role === "ADMIN" ||
      context.role === "DIRECTION" ||
      context.role === "RH";
    if (!allowed) {
      return {
        allowed: false,
        reason: "Seul le formateur (ou la direction/RH) annule une formation.",
      };
    }
  }
  return { allowed: true };
}

// ── Lectures ─────────────────────────────────────────────────────

export type TrainingFilters = {
  storeId?: string;
  status?: TrainingStatus;
};

export async function listTrainings(actor: SessionUser, filters: TrainingFilters = {}) {
  assertCan(actor, "training:read");
  const conditions: SQL[] = [];
  if (filters.storeId) conditions.push(eq(trainings.storeId, filters.storeId));
  if (filters.status) conditions.push(eq(trainings.status, filters.status));

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(trainings.storeId, scoped));
  }

  return db.query.trainings.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(trainings.trainingDate)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      trainer: { columns: { id: true, firstName: true, lastName: true } },
      participants: { columns: { id: true } },
    },
  });
}

export async function getTraining(actor: SessionUser, trainingId: string) {
  assertCan(actor, "training:read");
  const training = await db.query.trainings.findFirst({
    where: eq(trainings.id, trainingId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      franchisee: { columns: { id: true, companyName: true } },
      trainer: { columns: { id: true, firstName: true, lastName: true } },
      validatedBy: { columns: { id: true, firstName: true, lastName: true } },
      participants: true,
      documents: {
        with: { file: { columns: { id: true, originalName: true } } },
      },
    },
  });
  if (!training) return null;
  await assertStoreAccess(actor, training.storeId);
  return training;
}

// Documents signés rattachés automatiquement à une boutique / un franchisé
// (lecture via trainings, aucune duplication de fichier — cdc §9).
export async function listSignedDocsForStore(actor: SessionUser, storeId: string) {
  assertCan(actor, "training:read");
  await assertStoreAccess(actor, storeId);
  return db
    .select({
      fileId: trainingDocuments.fileId,
      originalName: fileAttachments.originalName,
      kind: trainingDocuments.kind,
      trainingId: trainings.id,
      trainingDate: trainings.trainingDate,
      trainingType: trainings.type,
    })
    .from(trainingDocuments)
    .innerJoin(trainings, eq(trainingDocuments.trainingId, trainings.id))
    .innerJoin(fileAttachments, eq(trainingDocuments.fileId, fileAttachments.id))
    .where(and(eq(trainings.storeId, storeId), eq(trainingDocuments.kind, "SIGNE")))
    .orderBy(desc(trainings.trainingDate));
}

export async function listSignedDocsForFranchisee(
  actor: SessionUser,
  franchiseeId: string
) {
  assertCan(actor, "training:read");
  if (actor.role === "FRANCHISE" && actor.franchiseeId !== franchiseeId) {
    throw new ForbiddenError("Accès limité à votre société.");
  }
  return db
    .select({
      fileId: trainingDocuments.fileId,
      originalName: fileAttachments.originalName,
      kind: trainingDocuments.kind,
      trainingId: trainings.id,
      trainingDate: trainings.trainingDate,
      trainingType: trainings.type,
    })
    .from(trainingDocuments)
    .innerJoin(trainings, eq(trainingDocuments.trainingId, trainings.id))
    .innerJoin(fileAttachments, eq(trainingDocuments.fileId, fileAttachments.id))
    .where(
      and(eq(trainings.franchiseeId, franchiseeId), eq(trainingDocuments.kind, "SIGNE"))
    )
    .orderBy(desc(trainings.trainingDate));
}

// ── Écritures ────────────────────────────────────────────────────

async function getEditableTraining(trainingId: string) {
  const training = await db.query.trainings.findFirst({
    where: eq(trainings.id, trainingId),
  });
  if (!training) throw new Error("Formation introuvable.");
  if (training.status === "VALIDEE" || training.status === "ANNULEE") {
    throw new Error("Formation close : plus modifiable.");
  }
  return training;
}

export async function createTraining(
  actor: SessionUser,
  input: {
    storeId: string;
    type: TrainingRow["type"];
    trainingDate: string;
    trainerId: string | null;
    notes: string | null;
  }
) {
  assertCan(actor, "training:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
    columns: { id: true, code: true, franchiseeId: true, animateurId: true },
  });
  if (!store) throw new Error("Boutique introuvable.");
  const trainerId = input.trainerId ?? actor.id;
  const trainer = await db.query.users.findFirst({
    where: and(eq(users.id, trainerId), eq(users.isActive, true)),
  });
  if (!trainer) throw new Error("Formateur invalide.");

  const training = await auditedInsert({ id: actor.id }, trainings, {
    storeId: input.storeId,
    // rattachement automatique au franchisé de la boutique
    franchiseeId: store.franchiseeId,
    trainerId,
    type: input.type,
    trainingDate: input.trainingDate,
    notes: input.notes,
  });

  const recipients = [trainerId, store.animateurId].filter(
    (id): id is string => id !== null && id !== actor.id
  );
  await notify([...new Set(recipients)], {
    type: "FORMATION",
    title: `Formation planifiée le ${input.trainingDate} — ${store.code}`,
    link: `/animation/formations/${training.id}`,
  });
  return training;
}

export async function updateTrainingReport(
  actor: SessionUser,
  trainingId: string,
  patch: { report: string | null; notes: string | null }
) {
  assertCan(actor, "training:write");
  await getEditableTraining(trainingId);
  return auditedUpdate({ id: actor.id }, trainings, trainingId, patch);
}

export async function transitionTraining(
  actor: SessionUser,
  trainingId: string,
  next: TrainingStatus
) {
  assertCan(actor, "training:write");
  const training = await db.query.trainings.findFirst({
    where: eq(trainings.id, trainingId),
  });
  if (!training) throw new Error("Formation introuvable.");

  const decision = canTransitionTraining(training.status, next, {
    hasReport: training.report !== null && training.report.trim() !== "",
    isTrainer: training.trainerId === actor.id,
    role: actor.role,
  });
  if (!decision.allowed) throw new ForbiddenError(decision.reason);

  const patch: Partial<typeof trainings.$inferInsert> = { status: next };
  if (next === "VALIDEE") {
    patch.validatedById = actor.id;
    patch.validatedAt = new Date();
  }
  const updated = await auditedUpdate({ id: actor.id }, trainings, trainingId, patch);

  if (next === "REALISEE" && training.trainerId !== actor.id) {
    await notify([training.trainerId], {
      type: "FORMATION",
      title: "Formation marquée réalisée — en attente de validation",
      link: `/animation/formations/${trainingId}`,
    });
  }
  return updated;
}

export async function addParticipant(
  actor: SessionUser,
  trainingId: string,
  name: string
) {
  assertCan(actor, "training:write");
  await getEditableTraining(trainingId);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Le nom du participant est obligatoire.");
  return auditedInsert({ id: actor.id }, trainingParticipants, {
    trainingId,
    name: trimmed,
  });
}

export async function removeParticipant(actor: SessionUser, participantId: string) {
  assertCan(actor, "training:write");
  const participant = await db.query.trainingParticipants.findFirst({
    where: eq(trainingParticipants.id, participantId),
  });
  if (!participant) throw new Error("Participant introuvable.");
  await getEditableTraining(participant.trainingId);
  await auditedDelete({ id: actor.id }, trainingParticipants, participantId);
}

// Upload des documents remis / signés — rattachés à la formation.
export async function attachTrainingDocuments(
  actor: SessionUser,
  trainingId: string,
  kind: "REMIS" | "SIGNE",
  files: File[]
) {
  assertCan(actor, "training:write");
  const training = await db.query.trainings.findFirst({
    where: eq(trainings.id, trainingId),
  });
  if (!training) throw new Error("Formation introuvable.");
  if (training.status === "ANNULEE") {
    throw new Error("Formation annulée : aucun document à rattacher.");
  }
  for (const file of files) {
    const attachment = await saveUpload(actor, file, {
      entityType: "TRAINING",
      entityId: trainingId,
    });
    await auditedInsert({ id: actor.id }, trainingDocuments, {
      trainingId,
      fileId: attachment.id,
      kind,
    });
  }
  return files.length;
}
