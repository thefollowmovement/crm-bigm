import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  auditCriteria,
  auditItems,
  fileAttachments,
  storeVisits,
  stores,
  users,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";

type VisitRow = typeof storeVisits.$inferSelect;
type VisitType = VisitRow["type"];

// ── Décisions pures (testées en unit) ────────────────────────────

// Note d'audit en % (0-100, 1 décimale) — dérivée, jamais stockée.
export function computeAuditScore(
  items: { score: number; maxScore: number }[]
): number | null {
  const totalMax = items.reduce((sum, i) => sum + i.maxScore, 0);
  if (totalMax === 0) return null;
  const total = items.reduce((sum, i) => sum + i.score, 0);
  return Math.round((total / totalMax) * 1000) / 10;
}

// La grille d'audit (référentiel) n'est modifiable que par la direction.
export function canManageCriteria(role: SessionUser["role"]): boolean {
  return role === "ADMIN" || role === "DIRECTION";
}

// ── Grille d'audit (référentiel) ─────────────────────────────────

export async function listCriteria(
  actor: SessionUser,
  options: { includeInactive?: boolean } = {}
) {
  assertCan(actor, "visit:read");
  return db.query.auditCriteria.findMany({
    where: options.includeInactive ? undefined : eq(auditCriteria.isActive, true),
    orderBy: [asc(auditCriteria.displayOrder), asc(auditCriteria.label)],
  });
}

export async function createCriterion(
  actor: SessionUser,
  input: { label: string; category: string | null; maxScore: number; displayOrder?: number }
) {
  assertCan(actor, "visit:write");
  if (!canManageCriteria(actor.role)) {
    throw new ForbiddenError("Seule la direction modifie la grille d'audit.");
  }
  const label = input.label.trim();
  if (!label) throw new Error("Le libellé du critère est obligatoire.");
  if (!Number.isInteger(input.maxScore) || input.maxScore < 1) {
    throw new Error("Le barème doit être un entier positif.");
  }
  return auditedInsert({ id: actor.id }, auditCriteria, {
    label,
    category: input.category,
    maxScore: input.maxScore,
    displayOrder: input.displayOrder ?? 0,
  });
}

export async function updateCriterion(
  actor: SessionUser,
  id: string,
  patch: { label?: string; category?: string | null; maxScore?: number; isActive?: boolean }
) {
  assertCan(actor, "visit:write");
  if (!canManageCriteria(actor.role)) {
    throw new ForbiddenError("Seule la direction modifie la grille d'audit.");
  }
  if (patch.maxScore !== undefined && (!Number.isInteger(patch.maxScore) || patch.maxScore < 1)) {
    throw new Error("Le barème doit être un entier positif.");
  }
  return auditedUpdate({ id: actor.id }, auditCriteria, id, patch);
}

// ── Visites ──────────────────────────────────────────────────────

export type VisitFilters = {
  storeId?: string;
  type?: VisitType;
  visitedById?: string;
};

export async function listVisits(actor: SessionUser, filters: VisitFilters = {}) {
  assertCan(actor, "visit:read");
  const conditions: SQL[] = [];
  if (filters.storeId) conditions.push(eq(storeVisits.storeId, filters.storeId));
  if (filters.type) conditions.push(eq(storeVisits.type, filters.type));
  if (filters.visitedById)
    conditions.push(eq(storeVisits.visitedById, filters.visitedById));

  return db.query.storeVisits.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(storeVisits.visitDate), desc(storeVisits.createdAt)],
    with: {
      store: { columns: { id: true, code: true, name: true } },
      visitedBy: { columns: { id: true, firstName: true, lastName: true } },
      items: { with: { criterion: { columns: { maxScore: true } } } },
    },
  });
}

export async function getVisit(actor: SessionUser, visitId: string) {
  assertCan(actor, "visit:read");
  const visit = await db.query.storeVisits.findFirst({
    where: eq(storeVisits.id, visitId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      visitedBy: { columns: { id: true, firstName: true, lastName: true } },
      items: {
        with: { criterion: true },
      },
      actionPlans: {
        columns: { id: true, number: true, title: true, status: true },
      },
    },
  });
  if (!visit) return null;

  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "STORE_VISIT"),
      eq(fileAttachments.entityId, visitId)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...visit, attachments };
}

export async function createVisit(
  actor: SessionUser,
  input: {
    storeId: string;
    type: VisitType;
    visitDate: string;
    report: string | null;
  }
) {
  assertCan(actor, "visit:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
    columns: { id: true },
  });
  if (!store) throw new Error("Boutique introuvable.");
  return auditedInsert({ id: actor.id }, storeVisits, {
    storeId: input.storeId,
    type: input.type,
    visitDate: input.visitDate,
    visitedById: actor.id,
    report: input.report,
  });
}

async function getEditableVisit(actor: SessionUser, visitId: string) {
  const visit = await db.query.storeVisits.findFirst({
    where: eq(storeVisits.id, visitId),
  });
  if (!visit) throw new Error("Visite introuvable.");
  if (visit.status === "FINALISEE") {
    throw new Error("Visite finalisée : plus modifiable.");
  }
  const isOwner = visit.visitedById === actor.id;
  if (!isOwner && actor.role !== "ADMIN" && actor.role !== "DIRECTION") {
    throw new ForbiddenError("Seul l'auteur de la visite peut la modifier.");
  }
  return visit;
}

export async function updateVisitReport(
  actor: SessionUser,
  visitId: string,
  report: string | null
) {
  assertCan(actor, "visit:write");
  await getEditableVisit(actor, visitId);
  return auditedUpdate({ id: actor.id }, storeVisits, visitId, { report });
}

// Note ou non-conformité sur un critère — upsert audité, visite en brouillon.
export async function setAuditItem(
  actor: SessionUser,
  visitId: string,
  input: { criterionId: string; score: number; isCompliant: boolean; comment: string | null }
) {
  assertCan(actor, "visit:write");
  const visit = await getEditableVisit(actor, visitId);
  if (visit.type !== "AUDIT") {
    throw new Error("La grille de notation est réservée aux audits.");
  }
  const criterion = await db.query.auditCriteria.findFirst({
    where: eq(auditCriteria.id, input.criterionId),
  });
  if (!criterion || !criterion.isActive) throw new Error("Critère introuvable.");
  if (
    !Number.isInteger(input.score) ||
    input.score < 0 ||
    input.score > criterion.maxScore
  ) {
    throw new Error(`Note invalide (0 à ${criterion.maxScore}).`);
  }

  const existing = await db.query.auditItems.findFirst({
    where: and(
      eq(auditItems.visitId, visitId),
      eq(auditItems.criterionId, input.criterionId)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, auditItems, existing.id, {
      score: input.score,
      isCompliant: input.isCompliant,
      comment: input.comment,
    });
  }
  return auditedInsert({ id: actor.id }, auditItems, {
    visitId,
    criterionId: input.criterionId,
    score: input.score,
    isCompliant: input.isCompliant,
    comment: input.comment,
  });
}

// Photos / documents de visite — tant que la visite est en brouillon.
export async function addVisitAttachments(
  actor: SessionUser,
  visitId: string,
  files: File[]
) {
  assertCan(actor, "visit:write");
  await getEditableVisit(actor, visitId);
  for (const file of files) {
    await saveUpload(actor, file, { entityType: "STORE_VISIT", entityId: visitId });
  }
  return files.length;
}

// Finalisation : un AUDIT exige au moins un critère noté et un compte rendu.
export async function finalizeVisit(actor: SessionUser, visitId: string) {
  assertCan(actor, "visit:write");
  const visit = await getEditableVisit(actor, visitId);
  if (!visit.report || visit.report.trim() === "") {
    throw new Error("Le compte rendu est obligatoire pour finaliser.");
  }
  if (visit.type === "AUDIT") {
    const [count] = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(auditItems)
      .where(eq(auditItems.visitId, visitId));
    if (count.n === 0) {
      throw new Error("Un audit finalisé doit comporter au moins un critère noté.");
    }
  }
  const updated = await auditedUpdate({ id: actor.id }, storeVisits, visitId, {
    status: "FINALISEE",
    finalizedAt: new Date(),
  });

  // La direction est prévenue des audits finalisés (cdc §7).
  if (visit.type === "AUDIT") {
    const store = await db.query.stores.findFirst({
      where: eq(stores.id, visit.storeId),
      columns: { code: true, name: true },
    });
    const direction = await db.query.users.findMany({
      where: and(inArray(users.role, ["ADMIN", "DIRECTION"]), eq(users.isActive, true)),
      columns: { id: true },
    });
    await notify(
      direction.map((u) => u.id).filter((id) => id !== actor.id),
      {
        type: "VISITE",
        title: `Audit finalisé — ${store?.code ?? ""} ${store?.name ?? ""}`,
        body: `Par ${actor.firstName} ${actor.lastName}, le ${visit.visitDate}.`,
        link: `/animation/visites/${visitId}`,
      }
    );
  }
  return updated;
}

// ── Tendances (graphiques cdc §7) ────────────────────────────────

export type AuditTrendRow = {
  month: string;
  scorePct: string | null;
  nonCompliantCount: number;
  auditCount: number;
};

// Note moyenne (%) et non-conformités par mois — audits FINALISÉS seulement.
export async function getAuditTrends(
  actor: SessionUser,
  filter: {
    from: string;
    to: string;
    storeId?: string;
    visitedById?: string;
    region?: string;
  }
): Promise<AuditTrendRow[]> {
  assertCan(actor, "visit:read");
  const conditions: SQL[] = [
    eq(storeVisits.type, "AUDIT"),
    eq(storeVisits.status, "FINALISEE"),
    gte(storeVisits.visitDate, filter.from),
    lte(storeVisits.visitDate, filter.to),
  ];
  if (filter.storeId) conditions.push(eq(storeVisits.storeId, filter.storeId));
  if (filter.visitedById)
    conditions.push(eq(storeVisits.visitedById, filter.visitedById));
  if (filter.region) conditions.push(eq(stores.region, filter.region));

  const bucket = sql<string>`to_char(date_trunc('month', ${storeVisits.visitDate}), 'YYYY-MM')`;
  return db
    .select({
      month: bucket,
      scorePct: sql<string | null>`
        CASE WHEN SUM(${auditCriteria.maxScore}) > 0 THEN
          ROUND(SUM(${auditItems.score})::numeric * 100 / SUM(${auditCriteria.maxScore}), 1)::text
        ELSE NULL END`,
      nonCompliantCount: sql<number>`COUNT(*) FILTER (WHERE NOT ${auditItems.isCompliant})::int`,
      auditCount: sql<number>`COUNT(DISTINCT ${storeVisits.id})::int`,
    })
    .from(auditItems)
    .innerJoin(storeVisits, eq(auditItems.visitId, storeVisits.id))
    .innerJoin(auditCriteria, eq(auditItems.criterionId, auditCriteria.id))
    .innerJoin(stores, eq(storeVisits.storeId, stores.id))
    .where(and(...conditions))
    .groupBy(bucket)
    .orderBy(bucket);
}
