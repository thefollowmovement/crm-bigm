import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  acctInvoiceMessages,
  acctInvoices,
  acctStructures,
  fileAttachments,
  tickets,
  transmissionEvents,
  transmissions,
  users,
} from "@/db/schema";
import { auditedInsert } from "@/lib/db/audited";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import { hashPassword } from "@/lib/auth/password";
import { saveUpload } from "@/lib/files/storage";
import { notify } from "@/services/notifications.service";
import { formatTransmissionNumber } from "@/services/transmissions.service";
import type { SessionUser } from "@/lib/auth/session";

// Espace prestataires (étape 53) : un client comptable externe (rôle
// PRESTATAIRE, users.acctStructureId) dépose ses factures/notes de frais,
// suit leurs statuts de paiement, discute pièce par pièce avec la compta et
// ouvre des tickets vers le pôle. TOUT est scopé sur SA structure — jamais
// de champ interne (notes de la pièce) dans les DTO qui lui sont servis.

// ── Garde du portail ─────────────────────────────────────────────

function providerStructureId(actor: SessionUser): string {
  if (!can(actor, "provider:portal") || !actor.acctStructureId) {
    throw new ForbiddenError("Espace réservé aux prestataires rattachés.");
  }
  return actor.acctStructureId;
}

export async function getProviderStructure(actor: SessionUser) {
  const structureId = providerStructureId(actor);
  const structure = await db.query.acctStructures.findFirst({
    where: eq(acctStructures.id, structureId),
    columns: { id: true, code: true, name: true, company: true, email: true },
  });
  if (!structure) throw new Error("Structure de rattachement introuvable.");
  return structure;
}

// ── Factures du prestataire (DTO SANS notes internes) ────────────

export type ProviderInvoice = {
  id: string;
  pieceNumber: string;
  pieceType: (typeof acctInvoices.$inferSelect)["pieceType"];
  pieceDate: string;
  dueDate: string | null;
  amountHT: string;
  amountTTC: string;
  status: (typeof acctInvoices.$inferSelect)["status"];
  lastReminderLevel: number | null;
};

export async function listProviderInvoices(
  actor: SessionUser
): Promise<ProviderInvoice[]> {
  const structureId = providerStructureId(actor);
  return db.query.acctInvoices.findMany({
    where: eq(acctInvoices.structureId, structureId),
    orderBy: [desc(acctInvoices.pieceDate), desc(acctInvoices.pieceNumber)],
    limit: 200,
    columns: {
      id: true,
      pieceNumber: true,
      pieceType: true,
      pieceDate: true,
      dueDate: true,
      amountHT: true,
      amountTTC: true,
      status: true,
      lastReminderLevel: true,
    },
  });
}

export async function getProviderInvoice(actor: SessionUser, invoiceId: string) {
  const structureId = providerStructureId(actor);
  const invoice = await db.query.acctInvoices.findFirst({
    where: and(
      eq(acctInvoices.id, invoiceId),
      eq(acctInvoices.structureId, structureId)
    ),
    columns: {
      id: true,
      pieceNumber: true,
      pieceType: true,
      accountClass: true,
      pieceDate: true,
      dueDate: true,
      amountHT: true,
      amountVAT: true,
      amountTTC: true,
      status: true,
      lastReminderLevel: true,
      lastReminderAt: true,
    },
  });
  if (!invoice) return null;
  const attachments = await db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "ACCT_INVOICE"),
      eq(fileAttachments.entityId, invoiceId)
    ),
    columns: { id: true, originalName: true },
  });
  return { ...invoice, attachments };
}

// ── Discussion sur une pièce (compta ↔ prestataire) ──────────────

// Accès au fil : la compta (accounting:read) ou le prestataire de la
// structure de la pièce. Retourne la pièce (id + structure) sinon lève.
async function assertMessageAccess(actor: SessionUser, invoiceId: string) {
  const invoice = await db.query.acctInvoices.findFirst({
    where: eq(acctInvoices.id, invoiceId),
    columns: { id: true, pieceNumber: true, structureId: true },
  });
  if (!invoice) throw new Error("Pièce introuvable.");
  if (can(actor, "accounting:read")) return invoice;
  if (
    can(actor, "provider:portal") &&
    actor.acctStructureId === invoice.structureId
  ) {
    return invoice;
  }
  throw new ForbiddenError("Cette discussion ne vous concerne pas.");
}

export async function listInvoiceMessages(actor: SessionUser, invoiceId: string) {
  await assertMessageAccess(actor, invoiceId);
  return db.query.acctInvoiceMessages.findMany({
    where: eq(acctInvoiceMessages.invoiceId, invoiceId),
    orderBy: [asc(acctInvoiceMessages.createdAt)],
    with: {
      author: { columns: { id: true, firstName: true, lastName: true, role: true } },
    },
  });
}

export async function postInvoiceMessage(
  actor: SessionUser,
  invoiceId: string,
  body: string
) {
  const invoice = await assertMessageAccess(actor, invoiceId);
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Le message est vide.");
  const message = await auditedInsert({ id: actor.id }, acctInvoiceMessages, {
    invoiceId,
    authorId: actor.id,
    body: trimmed,
  });

  if (actor.role === "PRESTATAIRE") {
    // Prestataire → compta.
    const compta = await db.query.users.findMany({
      where: and(eq(users.pole, "COMPTABILITE"), eq(users.isActive, true)),
      columns: { id: true },
    });
    await notify(
      compta.map((u) => u.id),
      {
        type: "COMPTABILITE",
        title: `Message sur la pièce ${invoice.pieceNumber}`,
        body: trimmed.slice(0, 140),
        link: `/compta/factures/${invoiceId}`,
      }
    );
  } else {
    // Compta → prestataires rattachés à la structure de la pièce.
    const providers = await db.query.users.findMany({
      where: and(
        eq(users.role, "PRESTATAIRE"),
        eq(users.acctStructureId, invoice.structureId),
        eq(users.isActive, true)
      ),
      columns: { id: true },
    });
    await notify(
      providers.map((u) => u.id).filter((id) => id !== actor.id),
      {
        type: "COMPTABILITE",
        title: `Réponse sur votre facture ${invoice.pieceNumber}`,
        body: trimmed.slice(0, 140),
        link: `/prestataire/factures/${invoiceId}`,
      }
    );
  }
  return message;
}

// ── Dépôts (transmissions) du prestataire ────────────────────────

const PROVIDER_CASES = new Set(["FACTURE_FOURNISSEUR", "NOTE_DE_FRAIS", "AUTRE"]);

export async function createProviderTransmission(
  actor: SessionUser,
  input: {
    type: "FACTURE" | "DEMANDE";
    caseType: "FACTURE_FOURNISSEUR" | "NOTE_DE_FRAIS" | "AUTRE";
    subject: string;
    amount?: string | null;
    message?: string | null;
  },
  files: File[] = []
) {
  const structureId = providerStructureId(actor);
  if (!PROVIDER_CASES.has(input.caseType)) {
    throw new Error("Cas d'usage non autorisé pour un prestataire.");
  }
  const transmission = await auditedInsert(actor, transmissions, {
    type: input.type,
    origin: "INTERNE" as const,
    emitterUserId: actor.id,
    targetPole: "COMPTABILITE" as const,
    structureId,
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
  const compta = await db.query.users.findMany({
    where: and(eq(users.pole, "COMPTABILITE"), eq(users.isActive, true)),
    columns: { id: true },
  });
  await notify(
    compta.map((u) => u.id),
    {
      type: "COMPTABILITE",
      title: `Dépôt prestataire ${formatTransmissionNumber(transmission.number)}`,
      body: transmission.subject,
      link: "/compta/transmissions",
    }
  );
  return transmission;
}

export async function listProviderTransmissions(actor: SessionUser) {
  providerStructureId(actor);
  return db.query.transmissions.findMany({
    where: eq(transmissions.emitterUserId, actor.id),
    orderBy: [desc(transmissions.createdAt)],
    limit: 100,
    columns: {
      id: true,
      number: true,
      type: true,
      caseType: true,
      subject: true,
      amount: true,
      status: true,
      createdAt: true,
    },
  });
}

// ── Tickets du prestataire (toujours vers la comptabilité) ───────

export async function createProviderTicket(
  actor: SessionUser,
  input: { title: string; description: string }
) {
  providerStructureId(actor);
  const ticket = await auditedInsert({ id: actor.id }, tickets, {
    title: input.title,
    description: input.description,
    fromPole: "COMPTABILITE" as const,
    toPole: "COMPTABILITE" as const,
    extraPoles: [],
    storeId: null,
    priority: "NORMALE" as const,
    dueDate: null,
    requesterId: actor.id,
    assigneeId: null,
    status: "NOUVEAU" as const,
  });
  const compta = await db.query.users.findMany({
    where: and(eq(users.pole, "COMPTABILITE"), eq(users.isActive, true)),
    columns: { id: true },
  });
  const number = `T-${String(ticket.number).padStart(6, "0")}`;
  await notify(
    compta.map((u) => u.id),
    {
      type: "TICKET",
      title: `Ticket prestataire ${number} : ${input.title}`,
      body: `De ${actor.firstName} ${actor.lastName} (prestataire externe)`,
      link: `/tickets/${ticket.id}`,
    }
  );
  return ticket;
}

export async function listProviderTickets(actor: SessionUser) {
  providerStructureId(actor);
  return db.query.tickets.findMany({
    where: eq(tickets.requesterId, actor.id),
    orderBy: [desc(tickets.createdAt)],
    limit: 100,
    columns: {
      id: true,
      number: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });
}

// ── Comptes prestataires (créés par l'administration) ────────────

export async function listProviderAccounts(actor: SessionUser, structureId: string) {
  assertCan(actor, "user:manage");
  return db.query.users.findMany({
    where: and(
      eq(users.role, "PRESTATAIRE"),
      eq(users.acctStructureId, structureId)
    ),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [asc(users.email)],
  });
}

export async function createProviderAccount(
  actor: SessionUser,
  structureId: string,
  input: { email: string; password: string; firstName: string; lastName: string }
) {
  assertCan(actor, "user:manage");
  const structure = await db.query.acctStructures.findFirst({
    where: eq(acctStructures.id, structureId),
    columns: { id: true, code: true, name: true },
  });
  if (!structure) throw new Error("Structure introuvable.");
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
    columns: { id: true },
  });
  if (existing) {
    throw new Error("Un utilisateur avec cette adresse e-mail existe déjà.");
  }
  const passwordHash = await hashPassword(input.password);
  return auditedInsert({ id: actor.id }, users, {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    role: "PRESTATAIRE" as const,
    pole: null,
    franchiseeId: null,
    acctStructureId: structure.id,
  });
}
