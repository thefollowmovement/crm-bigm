import "server-only";

import { and, asc, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  auditLogs,
  fileAttachments,
  invoices,
  payments,
  reminders,
  stores,
} from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { formatDateFr, todayParis } from "@/lib/dates";
import { sendReminderEmail } from "@/services/email.service";
import {
  addAmounts,
  compareAmounts,
  computeTTC,
  formatEUR,
  fromCents,
  toCents,
} from "@/lib/money";
import { saveUpload } from "@/lib/files/storage";

type InvoiceRow = typeof invoices.$inferSelect;
type InvoiceInsert = typeof invoices.$inferInsert;
type PaymentInsert = typeof payments.$inferInsert;
type ReminderInsert = typeof reminders.$inferInsert;

export type InvoiceStatus = InvoiceRow["status"];

// ─────────────── Logique pure (testée en unit) ───────────────

// Statut dérivé de la somme des paiements. Une facture ANNULEE le reste,
// quels que soient les paiements (ils sont de toute façon refusés).
export function computeInvoiceStatus(
  amountTTC: string,
  invoicePayments: { amount: string }[],
  current: InvoiceStatus
): InvoiceStatus {
  if (current === "ANNULEE") return "ANNULEE";
  const paid = addAmounts(...invoicePayments.map((p) => p.amount));
  if (toCents(paid) <= 0) return "EMISE";
  if (compareAmounts(paid, amountTTC) < 0) return "PARTIELLEMENT_PAYEE";
  return "PAYEE";
}

// « En retard » est DÉRIVÉ (règle CLAUDE.md n°8), jamais stocké :
// échéance strictement dépassée ET facture ni payée ni annulée.
export function isOverdue(
  invoice: Pick<InvoiceRow, "dueDate" | "status">,
  today: string
): boolean {
  if (invoice.status === "PAYEE" || invoice.status === "ANNULEE") return false;
  return invoice.dueDate < today;
}

// ─────────────── Numérotation ───────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Prochain numéro "F<année>-<n° sur 4 chiffres>" DANS la transaction fournie.
// L'advisory lock transactionnel sérialise les créations concurrentes : il
// n'est libéré qu'au commit, donc la transaction suivante voit la facture
// insérée par la précédente.
async function nextInvoiceNumberIn(tx: Tx, year: number): Promise<string> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('invoice-number'))`);
  const result = await tx.execute(sql`
    SELECT COALESCE(MAX(split_part(${invoices.number}, '-', 2)::int), 0) AS max
    FROM ${invoices}
    WHERE ${invoices.number} LIKE ${`F${year}-%`}
  `);
  const max = Number((result.rows[0] as { max: number | string }).max);
  return `F${year}-${String(max + 1).padStart(4, "0")}`;
}

export async function nextInvoiceNumber(year: number): Promise<string> {
  return db.transaction(async (tx) => nextInvoiceNumberIn(tx, year));
}

// Snapshot d'audit : mêmes règles que auditedInsert (dates → ISO).
function auditSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

// ─────────────── Écritures ───────────────

export type InvoiceInput = {
  storeId: string;
  type: InvoiceInsert["type"];
  label: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amountHT: string;
  vatRate: string;
  issuedAt: string;
  dueDate: string;
  notes: string | null;
};

export async function createInvoice(actor: SessionUser, input: InvoiceInput) {
  assertCan(actor, "finance:write");
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, input.storeId),
  });
  if (!store) throw new Error("Boutique introuvable.");
  if (toCents(input.amountHT) <= 0) {
    throw new Error("Le montant HT doit être supérieur à zéro.");
  }
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) {
    throw new Error("La fin de période doit être postérieure à son début.");
  }
  const amountTTC = computeTTC(input.amountHT, input.vatRate);
  const year = Number(input.issuedAt.slice(0, 4));

  // Numérotation + insertion + audit dans UNE SEULE transaction : les helpers
  // audités ouvrent la leur, ce qui relâcherait l'advisory lock avant
  // l'insertion (risque de doublon sous concurrence). On réplique donc ici
  // l'écriture auditée de auditedInsert, verrou compris.
  return db.transaction(async (tx) => {
    const number = await nextInvoiceNumberIn(tx, year);
    const [row] = await tx
      .insert(invoices)
      .values({ ...input, number, amountTTC })
      .returning();
    await tx.insert(auditLogs).values({
      userId: actor.id,
      action: "CREATE",
      tableName: "invoices",
      recordId: row.id,
      snapshot: auditSnapshot(row),
    });
    return row;
  });
}

export type PaymentInput = {
  amount: string;
  paidAt: string;
  method: PaymentInsert["method"];
  reference: string | null;
  notes: string | null;
};

export async function recordPayment(
  actor: SessionUser,
  invoiceId: string,
  input: PaymentInput
) {
  assertCan(actor, "finance:write");
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { payments: true },
  });
  if (!invoice) throw new Error("Facture introuvable.");
  if (invoice.status === "ANNULEE") {
    throw new Error("Impossible d'enregistrer un paiement sur une facture annulée.");
  }
  if (invoice.status === "PAYEE") {
    throw new Error("Cette facture est déjà intégralement payée.");
  }
  if (toCents(input.amount) <= 0) {
    throw new Error("Le montant du paiement doit être supérieur à zéro.");
  }
  const alreadyPaid = addAmounts(...invoice.payments.map((p) => p.amount));
  const remaining = fromCents(toCents(invoice.amountTTC) - toCents(alreadyPaid));
  if (compareAmounts(input.amount, remaining) > 0) {
    throw new Error(
      `Le paiement dépasse le solde restant dû (${formatEUR(remaining)}).`
    );
  }

  const payment = await auditedInsert({ id: actor.id }, payments, {
    invoiceId,
    amount: input.amount,
    paidAt: input.paidAt,
    method: input.method,
    reference: input.reference,
    notes: input.notes,
  });

  const newStatus = computeInvoiceStatus(
    invoice.amountTTC,
    [...invoice.payments, payment],
    invoice.status
  );
  if (newStatus !== invoice.status) {
    await auditedUpdate({ id: actor.id }, invoices, invoiceId, {
      status: newStatus,
    });
  }
  return payment;
}

export type ReminderInput = {
  level: number;
  channel: ReminderInsert["channel"];
  sentAt: string;
  notes: string | null;
  file?: File | null;
  // canal EMAIL : envoyer réellement l'e-mail (modèle du niveau + SMTP)
  sendEmail?: boolean;
};

export async function addReminder(
  actor: SessionUser,
  invoiceId: string,
  input: ReminderInput
) {
  assertCan(actor, "finance:write");
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { reminders: true, store: { with: { franchisee: true } } },
  });
  if (!invoice) throw new Error("Facture introuvable.");
  if (invoice.status === "PAYEE") {
    throw new Error("Impossible de relancer : la facture est déjà payée.");
  }
  if (invoice.status === "ANNULEE") {
    throw new Error("Impossible de relancer : la facture est annulée.");
  }
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 3) {
    throw new Error("Le niveau de relance doit être compris entre 1 et 3.");
  }
  const maxLevel = invoice.reminders.reduce((max, r) => Math.max(max, r.level), 0);
  if (input.level < maxLevel) {
    throw new Error(
      `Le niveau de relance ne peut pas régresser (dernier niveau envoyé : ${maxLevel}).`
    );
  }

  // Envoi réel AVANT l'enregistrement : pas d'envoi → pas de trace.
  let emailSentTo: string | null = null;
  if (input.sendEmail) {
    if (input.channel !== "EMAIL") {
      throw new Error(
        "L'envoi automatique n'est possible que pour le canal E-mail."
      );
    }
    const franchisee = invoice.store.franchisee;
    if (!franchisee?.email) {
      throw new Error(
        "Le franchisé de cette boutique n'a pas d'adresse e-mail : complétez sa fiche ou décochez l'envoi automatique."
      );
    }
    const sent = await sendReminderEmail({
      level: input.level,
      to: franchisee.email,
      variables: {
        contact_prenom: franchisee.contactFirstName,
        contact_nom: franchisee.contactLastName,
        societe: franchisee.companyName,
        boutique: `${invoice.store.code} — ${invoice.store.name}`,
        facture_numero: invoice.number,
        facture_montant: formatEUR(invoice.amountTTC),
        facture_echeance: formatDateFr(invoice.dueDate),
        niveau: String(input.level),
      },
    });
    emailSentTo = sent.to;
  }

  const reminder = await auditedInsert({ id: actor.id }, reminders, {
    invoiceId,
    level: input.level,
    channel: input.channel,
    sentAt: input.sentAt,
    sentById: actor.id,
    notes: input.notes,
    emailSentTo,
  });
  if (input.file) {
    await saveUpload(actor, input.file, {
      entityType: "REMINDER",
      entityId: reminder.id,
    });
  }
  return reminder;
}

export async function cancelInvoice(actor: SessionUser, invoiceId: string) {
  assertCan(actor, "finance:write");
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: { payments: { columns: { id: true } } },
  });
  if (!invoice) throw new Error("Facture introuvable.");
  if (invoice.status === "ANNULEE") {
    throw new Error("Cette facture est déjà annulée.");
  }
  if (invoice.payments.length > 0) {
    throw new Error(
      "Impossible d'annuler une facture sur laquelle des paiements sont enregistrés."
    );
  }
  return auditedUpdate({ id: actor.id }, invoices, invoiceId, {
    status: "ANNULEE",
  });
}

// ─────────────── Lectures ───────────────

// Total payé par facture, calculé en SQL (SUM numeric → string, jamais float).
const paidTotalSql = sql<string>`COALESCE((
  SELECT SUM(${payments.amount}) FROM ${payments}
  WHERE ${payments.invoiceId} = ${invoices.id}
), 0)::text`;

export async function listInvoices(
  actor: SessionUser,
  filters: { status?: InvoiceStatus; storeId?: string; overdueOnly?: boolean } = {}
) {
  assertCan(actor, "finance:read");
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  if (filters.storeId) conditions.push(eq(invoices.storeId, filters.storeId));
  if (filters.overdueOnly) {
    conditions.push(
      lt(invoices.dueDate, todayParis()),
      inArray(invoices.status, ["EMISE", "PARTIELLEMENT_PAYEE"])
    );
  }

  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      label: invoices.label,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      amountTTC: invoices.amountTTC,
      issuedAt: invoices.issuedAt,
      dueDate: invoices.dueDate,
      status: invoices.status,
      paidTotal: paidTotalSql,
      store: { id: stores.id, code: stores.code, name: stores.name },
    })
    .from(invoices)
    .innerJoin(stores, eq(invoices.storeId, stores.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(invoices.dueDate), asc(invoices.number));
}

// Factures d'une boutique — onglet Finances de la fiche boutique.
export async function listStoreInvoices(actor: SessionUser, storeId: string) {
  assertCan(actor, "finance:read");
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      label: invoices.label,
      amountTTC: invoices.amountTTC,
      issuedAt: invoices.issuedAt,
      dueDate: invoices.dueDate,
      status: invoices.status,
      paidTotal: paidTotalSql,
    })
    .from(invoices)
    .where(eq(invoices.storeId, storeId))
    .orderBy(desc(invoices.issuedAt), desc(invoices.number));
}

export async function getInvoice(actor: SessionUser, invoiceId: string) {
  assertCan(actor, "finance:read");
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.id, invoiceId),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      payments: { orderBy: [asc(payments.paidAt), asc(payments.createdAt)] },
      reminders: {
        orderBy: [asc(reminders.level), asc(reminders.sentAt)],
        with: { sentBy: { columns: { id: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!invoice) return null;

  const reminderIds = invoice.reminders.map((r) => r.id);
  const attachments = reminderIds.length
    ? await db.query.fileAttachments.findMany({
        where: and(
          eq(fileAttachments.entityType, "REMINDER"),
          inArray(fileAttachments.entityId, reminderIds)
        ),
        columns: { id: true, originalName: true, entityId: true },
      })
    : [];

  return {
    ...invoice,
    reminders: invoice.reminders.map((r) => ({
      ...r,
      attachments: attachments.filter((a) => a.entityId === r.id),
    })),
    paidTotal: addAmounts(...invoice.payments.map((p) => p.amount)),
  };
}
