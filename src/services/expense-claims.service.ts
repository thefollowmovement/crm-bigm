import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { expenseClaims, fileAttachments, storeVisits, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { saveUpload } from "@/lib/files/storage";
import { toCents } from "@/lib/money";
import { notify } from "@/services/notifications.service";
import type { SessionUser } from "@/lib/auth/session";

// Notes de frais des visites terrain (étape 54) : l'animateur saisit ses
// frais (VHR, péages…) sur SA visite avec justificatifs ; la direction
// valide ou refuse ; une note validée entre dans la file « Notes de frais »
// de la comptabilité (badge de nav + notification), qui la rembourse.

type ClaimRow = typeof expenseClaims.$inferSelect;

// La validation est réservée à la direction (comme la grille d'audit).
export function canDecideClaim(role: SessionUser["role"]): boolean {
  return role === "ADMIN" || role === "DIRECTION";
}

// ── Saisie sur la visite ─────────────────────────────────────────

export async function createExpenseClaim(
  actor: SessionUser,
  visitId: string,
  input: { title: string; amountTTC: string; note: string | null },
  files: File[] = []
) {
  assertCan(actor, "visit:write");
  const visit = await db.query.storeVisits.findFirst({
    where: eq(storeVisits.id, visitId),
    columns: { id: true },
  });
  if (!visit) throw new Error("Visite introuvable.");
  if (toCents(input.amountTTC) <= 0) {
    throw new Error("Le montant TTC doit être supérieur à zéro.");
  }
  const claim = await auditedInsert({ id: actor.id }, expenseClaims, {
    visitId,
    title: input.title,
    amountTTC: input.amountTTC,
    note: input.note,
    createdById: actor.id,
  });
  for (const file of files) {
    await saveUpload(actor, file, {
      entityType: "EXPENSE_CLAIM",
      entityId: claim.id,
    });
  }
  // La direction est prévenue qu'une note attend sa validation.
  const direction = await db.query.users.findMany({
    where: and(inArray(users.role, ["ADMIN", "DIRECTION"]), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    direction.map((u) => u.id).filter((id) => id !== actor.id),
    {
      type: "VISITE",
      title: `Note de frais à valider : ${input.title}`,
      body: `${actor.firstName} ${actor.lastName} — ${input.amountTTC} €`,
      link: `/animation/visites/${visitId}`,
    }
  );
  return claim;
}

// PJ groupées par note (une requête pour la page).
async function attachmentsByClaim(claimIds: string[]) {
  if (claimIds.length === 0) {
    return new Map<string, { id: string; originalName: string; title: string | null }[]>();
  }
  const rows = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "EXPENSE_CLAIM"),
      inArray(fileAttachments.entityId, claimIds)
    ),
    columns: { id: true, entityId: true, originalName: true, title: true },
  });
  const map = new Map<string, { id: string; originalName: string; title: string | null }[]>();
  for (const row of rows) {
    const list = map.get(row.entityId!) ?? [];
    list.push({ id: row.id, originalName: row.originalName, title: row.title });
    map.set(row.entityId!, list);
  }
  return map;
}

export async function listVisitClaims(actor: SessionUser, visitId: string) {
  assertCan(actor, "visit:read");
  const claims = await db.query.expenseClaims.findMany({
    where: eq(expenseClaims.visitId, visitId),
    orderBy: [desc(expenseClaims.createdAt)],
    with: {
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
    },
  });
  const attachments = await attachmentsByClaim(claims.map((c) => c.id));
  return claims.map((claim) => ({
    ...claim,
    attachments: attachments.get(claim.id) ?? [],
  }));
}

// ── Validation (direction) ───────────────────────────────────────

export async function decideExpenseClaim(
  actor: SessionUser,
  claimId: string,
  approve: boolean
) {
  assertCan(actor, "visit:write");
  if (!canDecideClaim(actor.role)) {
    throw new ForbiddenError("Seule la direction valide les notes de frais.");
  }
  const claim = await db.query.expenseClaims.findFirst({
    where: eq(expenseClaims.id, claimId),
  });
  if (!claim) throw new Error("Note de frais introuvable.");
  if (claim.status !== "DEMANDE") {
    throw new Error("Cette note de frais a déjà été traitée.");
  }
  const updated = await auditedUpdate({ id: actor.id }, expenseClaims, claimId, {
    status: approve ? ("VALIDEE" as const) : ("REFUSEE" as const),
    decidedById: actor.id,
    decidedAt: new Date(),
  });

  // L'auteur est informé de la décision…
  if (claim.createdById !== actor.id) {
    await notify([claim.createdById], {
      type: "VISITE",
      title: approve
        ? `Note de frais validée : ${claim.title}`
        : `Note de frais refusée : ${claim.title}`,
      body: `${claim.amountTTC} €`,
      link: `/animation/visites/${claim.visitId}`,
    });
  }
  // …et une note VALIDÉE entre dans la file de la comptabilité.
  if (approve) {
    const compta = await db.query.users.findMany({
      where: and(eq(users.pole, "COMPTABILITE"), eq(users.isActive, true)),
      columns: { id: true },
    });
    await notify(
      compta.map((u) => u.id).filter((id) => id !== actor.id),
      {
        type: "COMPTABILITE",
        title: `Note de frais à rembourser : ${claim.title}`,
        body: `${claim.amountTTC} € — validée par ${actor.firstName} ${actor.lastName}`,
        link: "/compta/notes-de-frais",
      }
    );
  }
  return updated;
}

// ── File de la comptabilité ──────────────────────────────────────

export async function listClaimsForAccounting(
  actor: SessionUser,
  filters: { status?: ClaimRow["status"] | null } = {}
) {
  assertCan(actor, "accounting:read");
  const claims = await db.query.expenseClaims.findMany({
    where: filters.status ? eq(expenseClaims.status, filters.status) : undefined,
    orderBy: [desc(expenseClaims.createdAt)],
    limit: 300,
    with: {
      createdBy: { columns: { id: true, firstName: true, lastName: true } },
      decidedBy: { columns: { id: true, firstName: true, lastName: true } },
      processedBy: { columns: { id: true, firstName: true, lastName: true } },
      visit: {
        columns: { id: true, visitDate: true },
        with: { store: { columns: { id: true, code: true, name: true } } },
      },
    },
  });
  const attachments = await attachmentsByClaim(claims.map((c) => c.id));
  return claims.map((claim) => ({
    ...claim,
    attachments: attachments.get(claim.id) ?? [],
  }));
}

export async function markClaimReimbursed(actor: SessionUser, claimId: string) {
  assertCan(actor, "accounting:write");
  const claim = await db.query.expenseClaims.findFirst({
    where: eq(expenseClaims.id, claimId),
  });
  if (!claim) throw new Error("Note de frais introuvable.");
  if (claim.status !== "VALIDEE") {
    throw new Error("Seule une note validée peut être marquée remboursée.");
  }
  const updated = await auditedUpdate({ id: actor.id }, expenseClaims, claimId, {
    status: "REMBOURSEE" as const,
    processedById: actor.id,
    processedAt: new Date(),
  });
  if (claim.createdById !== actor.id) {
    await notify([claim.createdById], {
      type: "COMPTABILITE",
      title: `Note de frais remboursée : ${claim.title}`,
      body: `${claim.amountTTC} €`,
      link: `/animation/visites/${claim.visitId}`,
    });
  }
  return updated;
}

// Badge de la nav Comptabilité : notes validées en attente de remboursement.
// Retourne 0 sans accounting:read (le badge n'apparaît pas).
export async function countClaimsToProcess(user: SessionUser): Promise<number> {
  if (!can(user, "accounting:read")) return 0;
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(expenseClaims)
    .where(eq(expenseClaims.status, "VALIDEE"));
  return row.count;
}
