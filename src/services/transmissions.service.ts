import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  acctInvoices,
  acctStructures,
  fileAttachments,
  transmissionEvents,
  transmissions,
  users,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  ForbiddenError,
  accessibleStoreIds,
  assertCan,
} from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { saveUpload } from "@/lib/files/storage";
import { fromCents, toCents } from "@/lib/money";
import { notify } from "@/services/notifications.service";
import type { SessionUser } from "@/lib/auth/session";

export type Transmission = typeof transmissions.$inferSelect;

export function formatTransmissionNumber(number: number): string {
  return `TR-${String(number).padStart(6, "0")}`;
}

// ── Lecture ──────────────────────────────────────────────────────
// transmission:manage (compta/direction) voit tout ; un émetteur interne ne
// voit que SES transmissions — même sans autre droit comptable.

export type TransmissionFilters = {
  status?: Transmission["status"] | null;
  type?: Transmission["type"] | null;
  origin?: Transmission["origin"] | null;
  caseType?: Transmission["caseType"] | null;
  structureId?: string | null;
};

export async function listTransmissions(
  actor: SessionUser,
  filters: TransmissionFilters = {}
) {
  const manage = can(actor, "transmission:manage");
  if (!manage) assertCan(actor, "transmission:create");

  const conditions = [];
  if (!manage) conditions.push(eq(transmissions.emitterUserId, actor.id));
  if (filters.status) conditions.push(eq(transmissions.status, filters.status));
  if (filters.type) conditions.push(eq(transmissions.type, filters.type));
  if (filters.origin) conditions.push(eq(transmissions.origin, filters.origin));
  if (filters.caseType)
    conditions.push(eq(transmissions.caseType, filters.caseType));
  if (filters.structureId)
    conditions.push(eq(transmissions.structureId, filters.structureId));

  return db.query.transmissions.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(transmissions.createdAt)],
    limit: 300,
    with: {
      emitter: { columns: { id: true, firstName: true, lastName: true } },
      structure: { columns: { id: true, code: true, name: true } },
      store: { columns: { id: true, name: true } },
      invoice: { columns: { id: true, pieceNumber: true } },
    },
  });
}

export async function getTransmission(actor: SessionUser, id: string) {
  const transmission = await db.query.transmissions.findFirst({
    where: eq(transmissions.id, id),
    with: {
      emitter: { columns: { id: true, firstName: true, lastName: true } },
      structure: { columns: { id: true, code: true, name: true } },
      store: { columns: { id: true, name: true } },
      invoice: { columns: { id: true, pieceNumber: true } },
      events: {
        orderBy: [desc(transmissionEvents.createdAt)],
        with: { user: { columns: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!transmission) return null;
  const manage = can(actor, "transmission:manage");
  if (!manage && transmission.emitterUserId !== actor.id) {
    throw new ForbiddenError();
  }
  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "TRANSMISSION"),
      eq(fileAttachments.entityId, id)
    ),
  });
  return { ...transmission, attachments };
}

// ── Création interne ─────────────────────────────────────────────

export type TransmissionInput = {
  type: Transmission["type"];
  caseType: Transmission["caseType"];
  targetPole?: Transmission["targetPole"];
  structureId?: string | null;
  storeId?: string | null;
  ticketId?: string | null;
  amount?: string | null;
  subject: string;
  message?: string | null;
};

export async function createTransmission(
  actor: SessionUser,
  input: TransmissionInput,
  files: File[] = []
) {
  assertCan(actor, "transmission:create");

  // Un franchisé ne soumet QUE pour sa propre boutique (cdc §2.4) : boutique
  // obligatoire, dans son périmètre ; structure liée à cette boutique le cas
  // échéant.
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (!input.storeId || !scoped.includes(input.storeId)) {
      throw new ForbiddenError(
        "Un franchisé transmet uniquement pour sa propre boutique."
      );
    }
    if (input.structureId) {
      const structure = await db.query.acctStructures.findFirst({
        where: eq(acctStructures.id, input.structureId),
        columns: { storeId: true },
      });
      if (!structure || structure.storeId !== input.storeId) {
        throw new ForbiddenError(
          "Structure hors du périmètre de votre boutique."
        );
      }
    }
  }

  const transmission = await auditedInsert(actor, transmissions, {
    type: input.type,
    origin: "INTERNE" as const,
    emitterUserId: actor.id,
    targetPole: input.targetPole ?? "COMPTABILITE",
    structureId: input.structureId ?? null,
    storeId: input.storeId ?? null,
    ticketId: input.ticketId ?? null,
    caseType: input.caseType,
    amount: input.amount ?? null,
    subject: input.subject,
    message: input.message ?? null,
  });
  await auditedInsert(actor, transmissionEvents, {
    transmissionId: transmission.id,
    userId: actor.id,
    oldStatus: null,
    newStatus: "EN_ATTENTE" as const,
  });
  for (const file of files) {
    await saveUpload(actor, file, {
      entityType: "TRANSMISSION",
      entityId: transmission.id,
    });
  }
  await notifyPole(transmission.targetPole, actor.id, {
    title: `Nouvelle transmission ${formatTransmissionNumber(transmission.number)}`,
    body: transmission.subject,
    link: "/compta/transmissions",
  });
  return transmission;
}

// Notification des membres actifs du pôle destinataire.
async function notifyPole(
  pole: NonNullable<Transmission["targetPole"]>,
  exceptUserId: string | null,
  payload: { title: string; body?: string; link: string }
) {
  const members = await db.query.users.findMany({
    where: and(eq(users.pole, pole), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    members.map((m) => m.id).filter((id) => id !== exceptUserId),
    { type: "COMPTABILITE", ...payload }
  );
}

// ── Traitement (compta) ──────────────────────────────────────────

export async function changeTransmissionStatus(
  actor: SessionUser,
  id: string,
  newStatus: Transmission["status"],
  comment?: string | null
) {
  assertCan(actor, "transmission:manage");
  const before = await db.query.transmissions.findFirst({
    where: eq(transmissions.id, id),
  });
  if (!before) throw new Error("Transmission introuvable.");
  if (before.status === newStatus) return before;

  const updated = await auditedUpdate(actor, transmissions, id, {
    status: newStatus,
  });
  await auditedInsert(actor, transmissionEvents, {
    transmissionId: id,
    userId: actor.id,
    oldStatus: before.status,
    newStatus,
    comment: comment ?? null,
  });
  if (before.emitterUserId && before.emitterUserId !== actor.id) {
    const labels: Record<Transmission["status"], string> = {
      EN_ATTENTE: "remise en attente",
      VALIDEE: "validée",
      REJETEE: "rejetée",
      TRAITEE: "traitée",
    };
    await notify([before.emitterUserId], {
      type: "COMPTABILITE",
      title: `Transmission ${formatTransmissionNumber(before.number)} ${labels[newStatus]}`,
      body: comment ?? before.subject,
      link: "/compta/transmissions",
    });
  }
  return updated;
}

// ── Conversion en facture comptable (cdc §3.2) ───────────────────
// Une transmission VALIDÉE devient une pièce du journal, source
// TRANSMISSION (« Transmission externe validée ») pour garder l'origine.

export async function convertTransmissionToInvoice(
  actor: SessionUser,
  id: string,
  input: {
    pieceNumber: string;
    pieceType: (typeof acctInvoices.$inferSelect)["pieceType"];
    invoiceType: (typeof acctInvoices.$inferSelect)["invoiceType"];
    accountClass: (typeof acctInvoices.$inferSelect)["accountClass"];
    pieceDate: string;
    dueDate?: string | null;
    structureId: string;
    amountHT: string;
    amountTTC: string;
  }
) {
  assertCan(actor, "transmission:manage");
  assertCan(actor, "accounting:write");
  const transmission = await db.query.transmissions.findFirst({
    where: eq(transmissions.id, id),
  });
  if (!transmission) throw new Error("Transmission introuvable.");
  if (transmission.invoiceId) {
    throw new Error("Cette transmission a déjà été convertie en facture.");
  }
  if (transmission.status !== "VALIDEE") {
    throw new Error(
      "Seule une transmission validée peut être convertie en facture."
    );
  }
  const clash = await db.query.acctInvoices.findFirst({
    where: eq(acctInvoices.pieceNumber, input.pieceNumber),
    columns: { id: true },
  });
  if (clash) throw new Error(`La pièce « ${input.pieceNumber} » existe déjà.`);

  const invoice = await auditedInsert(actor, acctInvoices, {
    ...input,
    amountVAT: fromCents(toCents(input.amountTTC) - toCents(input.amountHT)),
    source: "TRANSMISSION" as const,
    label: `${formatTransmissionNumber(transmission.number)} — ${transmission.subject}`,
  });
  await auditedUpdate(actor, transmissions, id, {
    invoiceId: invoice.id,
    status: "TRAITEE",
  });
  await auditedInsert(actor, transmissionEvents, {
    transmissionId: id,
    userId: actor.id,
    oldStatus: "VALIDEE" as const,
    newStatus: "TRAITEE" as const,
    comment: `Convertie en facture ${input.pieceNumber}.`,
  });
  if (transmission.emitterUserId && transmission.emitterUserId !== actor.id) {
    await notify([transmission.emitterUserId], {
      type: "COMPTABILITE",
      title: `Transmission ${formatTransmissionNumber(transmission.number)} traitée`,
      body: `Facture ${input.pieceNumber} enregistrée au journal.`,
      link: "/compta/transmissions",
    });
  }
  return invoice;
}

// Structures proposées à un émetteur : toutes pour le siège, celles de ses
// boutiques pour un franchisé.
export async function listStructureOptionsForEmitter(actor: SessionUser) {
  assertCan(actor, "transmission:create");
  const scoped = await accessibleStoreIds(actor);
  if (scoped === null) {
    return db.query.acctStructures.findMany({
      where: eq(acctStructures.isActive, true),
      columns: { id: true, code: true, name: true, storeId: true },
      orderBy: [acctStructures.code],
    });
  }
  if (scoped.length === 0) return [];
  return db.query.acctStructures.findMany({
    where: and(
      eq(acctStructures.isActive, true),
      inArray(acctStructures.storeId, scoped)
    ),
    columns: { id: true, code: true, name: true, storeId: true },
    orderBy: [acctStructures.code],
  });
}
