import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  transmissionEvents,
  transmissionInvites,
  transmissions,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import { saveExternalUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";
import { formatTransmissionNumber } from "@/services/transmissions.service";
import { users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";

export type TransmissionInvite = typeof transmissionInvites.$inferSelect;

const MAX_EXTERNAL_FILES = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string): string {
  const base = process.env.APP_URL ?? "";
  return `${base}/transmission/${token}`;
}

// ── Gestion des invitations (compta/direction) ───────────────────

export async function createInvite(
  actor: SessionUser,
  input: {
    email: string;
    externalName?: string | null;
    category: TransmissionInvite["category"];
    structureId?: string | null;
    expiresInDays: number;
    note?: string | null;
  }
): Promise<{ invite: TransmissionInvite; token: string }> {
  assertCan(actor, "transmission:manage");
  if (!input.email.includes("@")) throw new Error("Adresse e-mail invalide.");
  const days = Math.min(Math.max(Math.round(input.expiresInDays), 1), 90);
  // 32 octets aléatoires : le jeton n'est montré qu'une fois, seul son
  // sha256 est stocké (un dump de la base ne permet pas de rejouer un lien).
  const token = randomBytes(32).toString("base64url");
  const invite = await auditedInsert(actor, transmissionInvites, {
    tokenHash: hashToken(token),
    email: input.email.trim(),
    externalName: input.externalName ?? null,
    category: input.category,
    structureId: input.structureId ?? null,
    note: input.note ?? null,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    createdById: actor.id,
  });
  return { invite, token };
}

export async function listInvites(actor: SessionUser) {
  assertCan(actor, "transmission:manage");
  return db.query.transmissionInvites.findMany({
    orderBy: [desc(transmissionInvites.createdAt)],
    limit: 50,
    with: {
      structure: { columns: { code: true, name: true } },
      createdBy: { columns: { firstName: true, lastName: true } },
    },
  });
}

export async function revokeInvite(actor: SessionUser, id: string) {
  assertCan(actor, "transmission:manage");
  const invite = await db.query.transmissionInvites.findFirst({
    where: eq(transmissionInvites.id, id),
  });
  if (!invite) throw new Error("Invitation introuvable.");
  if (invite.usedAt) throw new Error("Ce lien a déjà été utilisé.");
  if (invite.revokedAt) return invite;
  return auditedUpdate(actor, transmissionInvites, id, {
    revokedAt: new Date(),
  });
}

// ── Côté public (AUCUNE session) ─────────────────────────────────

export type InviteValidity =
  | { valid: true; invite: TransmissionInvite & { structure: { code: string; name: string } | null } }
  | { valid: false };

// Recherche du jeton par hash : lien inconnu, expiré, révoqué ou déjà
// utilisé → même réponse neutre (pas d'indice pour l'attaquant).
export async function findValidInvite(token: string): Promise<InviteValidity> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { valid: false };
  const invite = await db.query.transmissionInvites.findFirst({
    where: eq(transmissionInvites.tokenHash, hashToken(token)),
    with: { structure: { columns: { code: true, name: true } } },
  });
  if (
    !invite ||
    invite.usedAt !== null ||
    invite.revokedAt !== null ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    return { valid: false };
  }
  return { valid: true, invite };
}

export type ExternalSubmission = {
  type: (typeof transmissions.$inferSelect)["type"];
  caseType: (typeof transmissions.$inferSelect)["caseType"];
  externalName: string;
  subject: string;
  message?: string | null;
  amount?: string | null;
};

// Soumission externe : consommation ATOMIQUE du jeton (usage unique, même
// sous concurrence), création de la transmission EXTERNE avec IP tracée,
// pièces jointes validées strictement, notification de la comptabilité.
// Aucune donnée n'entre dans les factures : statut « En attente » jusqu'à
// validation manuelle d'un comptable (cdc §2.2).
export async function submitExternalTransmission(
  token: string,
  input: ExternalSubmission,
  files: File[],
  ip: string | null
) {
  const check = await findValidInvite(token);
  if (!check.valid) throw new Error("Ce lien n'est plus valide.");
  if (files.length > MAX_EXTERNAL_FILES) {
    throw new Error(`Au maximum ${MAX_EXTERNAL_FILES} pièces jointes.`);
  }

  // Marque le jeton utilisé en une seule requête conditionnelle : si un
  // envoi concurrent est passé avant, aucune ligne n'est touchée → refus.
  const consumed = await db
    .update(transmissionInvites)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(transmissionInvites.id, check.invite.id),
        isNull(transmissionInvites.usedAt),
        isNull(transmissionInvites.revokedAt)
      )
    )
    .returning({ id: transmissionInvites.id });
  if (consumed.length === 0) throw new Error("Ce lien n'est plus valide.");

  const systemActor = { id: null, ip };
  const transmission = await auditedInsert(systemActor, transmissions, {
    type: input.type,
    origin: "EXTERNE" as const,
    emitterUserId: null,
    externalName: input.externalName,
    externalEmail: check.invite.email,
    externalCategory: check.invite.category,
    targetPole: "COMPTABILITE" as const,
    structureId: check.invite.structureId,
    caseType: input.caseType,
    amount: input.amount ?? null,
    subject: input.subject,
    message: input.message ?? null,
    submittedIp: ip,
    inviteId: check.invite.id,
  });
  await auditedInsert(systemActor, transmissionEvents, {
    transmissionId: transmission.id,
    userId: null,
    oldStatus: null,
    newStatus: "EN_ATTENTE" as const,
  });
  for (const file of files) {
    await saveExternalUpload(file, {
      entityType: "TRANSMISSION",
      entityId: transmission.id,
      ip,
    });
  }

  // Notification automatique d'un comptable dès l'arrivée (cdc §2.2).
  const comptables = await db.query.users.findMany({
    where: and(eq(users.pole, "COMPTABILITE"), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    comptables.map((m) => m.id),
    {
      type: "COMPTABILITE",
      title: `Transmission externe ${formatTransmissionNumber(transmission.number)}`,
      body: `${input.externalName} — ${input.subject}`,
      link: "/compta/transmissions",
    }
  );
  return transmission;
}
