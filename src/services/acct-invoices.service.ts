import "server-only";

import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  acctImports,
  acctInvoices,
  acctStructures,
  fileAttachments,
} from "@/db/schema";
import { auditAggregate, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import { saveUpload } from "@/lib/files/storage";
import {
  parseInvoiceRows,
  type ParsedInvoiceRow,
} from "@/lib/import/invoices-import";
import { readTabularFile } from "@/lib/import/tabular";
import { fromCents, toCents } from "@/lib/money";
import type { SessionUser } from "@/lib/auth/session";

export type AcctInvoice = typeof acctInvoices.$inferSelect;

const BATCH_SIZE = 200;
const MAX_REPORT_ERRORS = 200;

// ── Lecture ──────────────────────────────────────────────────────

export type InvoiceFilters = {
  q?: string | null;
  structureId?: string | null;
  accountClass?: AcctInvoice["accountClass"] | null;
  status?: AcctInvoice["status"] | null;
  pieceType?: AcctInvoice["pieceType"] | null;
  invoiceType?: AcctInvoice["invoiceType"] | null;
  from?: string | null; // YYYY-MM-DD inclus
  to?: string | null;
};

export async function listInvoices(
  actor: SessionUser,
  filters: InvoiceFilters = {},
  limit = 300
) {
  assertCan(actor, "accounting:read");
  const conditions = [];
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(ilike(acctInvoices.pieceNumber, like), ilike(acctInvoices.label, like))
    );
  }
  if (filters.structureId)
    conditions.push(eq(acctInvoices.structureId, filters.structureId));
  if (filters.accountClass)
    conditions.push(eq(acctInvoices.accountClass, filters.accountClass));
  if (filters.status) conditions.push(eq(acctInvoices.status, filters.status));
  if (filters.pieceType)
    conditions.push(eq(acctInvoices.pieceType, filters.pieceType));
  if (filters.invoiceType)
    conditions.push(eq(acctInvoices.invoiceType, filters.invoiceType));
  if (filters.from) conditions.push(gte(acctInvoices.pieceDate, filters.from));
  if (filters.to) conditions.push(lte(acctInvoices.pieceDate, filters.to));

  const invoices = await db.query.acctInvoices.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [desc(acctInvoices.pieceDate), desc(acctInvoices.pieceNumber)],
    limit,
    with: {
      structure: { columns: { id: true, code: true, name: true } },
    },
  });

  // Documents attachés aux pièces (étape 51) — une seule requête pour la page.
  const ids = invoices.map((i) => i.id);
  const attachments = ids.length
    ? await db.query.fileAttachments.findMany({
        where: and(
          eq(fileAttachments.entityType, "ACCT_INVOICE"),
          inArray(fileAttachments.entityId, ids)
        ),
        columns: { id: true, entityId: true, originalName: true },
      })
    : [];
  const byInvoice = new Map<string, { id: string; originalName: string }[]>();
  for (const file of attachments) {
    const list = byInvoice.get(file.entityId!) ?? [];
    list.push({ id: file.id, originalName: file.originalName });
    byInvoice.set(file.entityId!, list);
  }
  return invoices.map((invoice) => ({
    ...invoice,
    attachments: byInvoice.get(invoice.id) ?? [],
  }));
}

// PJ d'une pièce du journal (facture scannée, justificatif…) — étape 51.
export async function addInvoiceAttachments(
  actor: SessionUser,
  invoiceId: string,
  files: File[]
) {
  assertCan(actor, "accounting:write");
  const invoice = await db.query.acctInvoices.findFirst({
    where: eq(acctInvoices.id, invoiceId),
    columns: { id: true },
  });
  if (!invoice) throw new Error("Pièce introuvable.");
  for (const file of files) {
    await saveUpload(actor, file, {
      entityType: "ACCT_INVOICE",
      entityId: invoiceId,
    });
  }
  return files.length;
}

// ── Écriture unitaire (statut/classification = compta uniquement) ─

export type InvoiceInput = {
  pieceNumber: string;
  pieceType: AcctInvoice["pieceType"];
  invoiceType: AcctInvoice["invoiceType"];
  accountClass: AcctInvoice["accountClass"];
  pieceDate: string;
  dueDate?: string | null;
  structureId: string;
  amountHT: string;
  amountVAT?: string | null;
  amountTTC: string;
  company?: string | null;
  label?: string | null;
  notes?: string | null;
  source?: AcctInvoice["source"];
};

export async function createInvoice(actor: SessionUser, input: InvoiceInput) {
  assertCan(actor, "accounting:write");
  const clash = await db.query.acctInvoices.findFirst({
    where: eq(acctInvoices.pieceNumber, input.pieceNumber),
    columns: { id: true },
  });
  if (clash) {
    throw new Error(`La pièce « ${input.pieceNumber} » existe déjà.`);
  }
  const structure = await db.query.acctStructures.findFirst({
    where: eq(acctStructures.id, input.structureId),
    columns: { id: true },
  });
  if (!structure) throw new Error("Structure liée introuvable.");
  return auditedInsert(actor, acctInvoices, {
    ...input,
    amountVAT:
      input.amountVAT ?? fromCents(toCents(input.amountTTC) - toCents(input.amountHT)),
    source: input.source ?? "SAISIE",
  });
}

export async function updateInvoice(
  actor: SessionUser,
  id: string,
  patch: Partial<
    Pick<
      InvoiceInput,
      "invoiceType" | "accountClass" | "dueDate" | "label" | "notes"
    >
  > & { status?: AcctInvoice["status"] }
) {
  assertCan(actor, "accounting:write");
  return auditedUpdate(actor, acctInvoices, id, patch);
}

// ── Import du journal Factures / Avoirs (cdc §3.3) ───────────────
// La classe comptable (6/7) est absente des exports : elle est choisie au
// moment de l'import et s'applique à toutes les pièces du fichier (un journal
// de ventes s'importe en classe 7, un journal d'achats en classe 6).

export async function importInvoices(
  actor: SessionUser,
  file: File,
  mode: "IGNORER" | "METTRE_A_JOUR",
  accountClass: AcctInvoice["accountClass"]
) {
  assertCan(actor, "accounting:import");

  const buffer = Buffer.from(await file.arrayBuffer());
  const read = readTabularFile(buffer, file.name);
  if ("error" in read) throw new Error(read.error);
  const { rows, errors } = parseInvoiceRows(read.rows);
  if (rows.length === 0 && errors.length === 0) {
    throw new Error("Le fichier ne contient aucune ligne de données.");
  }

  const importRow = await auditedInsert(actor, acctImports, {
    kind: "FACTURES" as const,
    mode,
    fileName: file.name,
    format: read.format,
    totalRows: rows.length + errors.length,
    createdById: actor.id,
  });
  const saved = await saveUpload(actor, file, {
    entityType: "ACCT_IMPORT",
    entityId: importRow.id,
  });

  const reportErrors = errors.slice(0, MAX_REPORT_ERRORS).map((e) => ({
    line: e.line,
    message: e.message,
  }));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let processed = errors.length;

  try {
    // Rapprochement Client → Code du référentiel : une pièce dont la
    // structure est inconnue est une erreur explicite nommant le code.
    const codes = [...new Set(rows.map((r) => r.clientCode))];
    const structures = codes.length
      ? await db.query.acctStructures.findMany({
          where: inArray(acctStructures.code, codes),
          columns: { id: true, code: true },
        })
      : [];
    const structureByCode = new Map(structures.map((s) => [s.code, s.id]));

    const resolved: (ParsedInvoiceRow & { structureId: string })[] = [];
    for (const row of rows) {
      const structureId = structureByCode.get(row.clientCode);
      if (!structureId) {
        processed += 1;
        if (reportErrors.length < MAX_REPORT_ERRORS) {
          reportErrors.push({
            line: row.line,
            message: `Structure inconnue : code « ${row.clientCode} » absent du référentiel (pièce ${row.pieceNumber}).`,
          });
        }
        continue;
      }
      resolved.push({ ...row, structureId });
    }

    const pieceNumbers = resolved.map((r) => r.pieceNumber);
    const existing = pieceNumbers.length
      ? await db.query.acctInvoices.findMany({
          where: inArray(acctInvoices.pieceNumber, pieceNumbers),
          columns: { id: true, pieceNumber: true },
        })
      : [];
    const idByPiece = new Map(existing.map((i) => [i.pieceNumber, i.id]));

    const toCreate = resolved.filter((r) => !idByPiece.has(r.pieceNumber));
    const duplicates = resolved.filter((r) => idByPiece.has(r.pieceNumber));

    const sourceByFormat = {
      xlsx: "IMPORT_XLSX",
      xls: "IMPORT_XLS",
      xlsb: "IMPORT_XLSB",
      csv: "IMPORT_CSV",
    } as const;
    const source = sourceByFormat[read.format];

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE);
      await db.insert(acctInvoices).values(
        chunk.map((row) => ({
          pieceNumber: row.pieceNumber,
          pieceType: row.pieceType,
          accountClass,
          pieceDate: row.pieceDate,
          structureId: row.structureId,
          amountHT: row.amountHT,
          amountVAT: row.amountVAT,
          amountTTC: row.amountTTC,
          company: row.company,
          source,
          // Statut : repris de la colonne STATUT du fichier si elle est
          // renseignée (étape 51) ; sinon « En attente » par défaut, à
          // renseigner ensuite à la main par les comptables (cdc §3.2).
          ...(row.status ? { status: row.status } : {}),
        }))
      );
      created += chunk.length;
      processed += chunk.length;
      await db
        .update(acctImports)
        .set({ processedRows: processed, createdRows: created })
        .where(eq(acctImports.id, importRow.id));
    }

    if (mode === "METTRE_A_JOUR") {
      for (let i = 0; i < duplicates.length; i += BATCH_SIZE) {
        const chunk = duplicates.slice(i, i + BATCH_SIZE);
        await db.transaction(async (tx) => {
          for (const row of chunk) {
            // Montants/dates/type réalignés sur l'export. Statut : la colonne
            // STATUT du fichier fait foi quand elle est renseignée (étape 51) ;
            // sans elle, le statut saisi à la main n'est jamais écrasé.
            await tx
              .update(acctInvoices)
              .set({
                pieceType: row.pieceType,
                accountClass,
                pieceDate: row.pieceDate,
                structureId: row.structureId,
                amountHT: row.amountHT,
                amountVAT: row.amountVAT,
                amountTTC: row.amountTTC,
                company: row.company,
                source,
                ...(row.status ? { status: row.status } : {}),
              })
              .where(eq(acctInvoices.id, idByPiece.get(row.pieceNumber)!));
          }
        });
        updated += chunk.length;
        processed += chunk.length;
        await db
          .update(acctImports)
          .set({ processedRows: processed, updatedRows: updated })
          .where(eq(acctImports.id, importRow.id));
      }
    } else {
      skipped = duplicates.length;
      processed += duplicates.length;
    }

    await auditAggregate(actor, {
      action: "IMPORT",
      tableName: "acct_invoices",
      recordId: importRow.id,
      snapshot: {
        fileName: file.name,
        format: read.format,
        mode,
        accountClass,
        created,
        updated,
        skipped,
        errorCount: reportErrors.length,
        fileId: saved.id,
      },
    });

    const [final] = await db
      .update(acctImports)
      .set({
        status: "TERMINE",
        fileId: saved.id,
        processedRows: processed,
        createdRows: created,
        updatedRows: updated,
        skippedRows: skipped,
        errors: reportErrors,
      })
      .where(eq(acctImports.id, importRow.id))
      .returning();
    return final;
  } catch (e) {
    await db
      .update(acctImports)
      .set({
        status: "ERREUR",
        fileId: saved.id,
        errors: [
          ...reportErrors,
          { line: 0, message: e instanceof Error ? e.message : "Erreur inconnue." },
        ],
      })
      .where(eq(acctImports.id, importRow.id));
    throw e;
  }
}

// ── Résultat comptable (cdc §3.2) ────────────────────────────────
// CA total = Σ montants classe 7 (avoirs négatifs conservés) ;
// Charges = Σ montants classe 6 ; Résultat = CA − Charges.
// Sur les montants HT (la TVA n'est ni une charge ni un produit), pièces
// annulées exclues. Arithmétique en centimes entiers, jamais en float.

export type AcctResult = {
  revenueHT: string;
  expensesHT: string;
  result: string;
};

export async function computeResult(
  actor: SessionUser,
  options: { from?: string | null; to?: string | null; structureId?: string | null } = {}
): Promise<AcctResult> {
  assertCan(actor, "accounting:read");
  const clauses = [sql`status <> 'ANNULEE'`];
  if (options.from) clauses.push(sql`piece_date >= ${options.from}`);
  if (options.to) clauses.push(sql`piece_date <= ${options.to}`);
  if (options.structureId)
    clauses.push(sql`structure_id = ${options.structureId}`);
  const where = sql.join(clauses, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount_ht) FILTER (WHERE account_class = 'PRODUIT'), 0)::text AS revenue,
      COALESCE(SUM(amount_ht) FILTER (WHERE account_class = 'CHARGE'), 0)::text AS expenses
    FROM acct_invoices
    WHERE ${where}
  `);
  const row = result.rows[0] as { revenue: string; expenses: string };
  const revenue = fromCents(toCents(row.revenue));
  const expenses = fromCents(toCents(row.expenses));
  return {
    revenueHT: revenue,
    expensesHT: expenses,
    result: fromCents(toCents(revenue) - toCents(expenses)),
  };
}

// ── Liste des clients comptables avec agrégats (cdc Besoin 3) ────
// Agrégats calculés CÔTÉ BASE (performance avec un grand volume de pièces) :
// nb de pièces, CA / charges HT sur la période, montant restant dû (pièces
// En attente / En retard / Impayée, toutes périodes), dernière pièce.

export type StructureWithAggregates = {
  id: string;
  code: string;
  name: string;
  company: string | null;
  city: string | null;
  type: (typeof acctStructures.$inferSelect)["type"];
  isActive: boolean;
  creditAvailable: string | null;
  pieceCount: number;
  revenueHT: string;
  expensesHT: string;
  result: string;
  amountDue: string;
  lastPieceDate: string | null;
};

export async function listStructuresWithAggregates(
  actor: SessionUser,
  options: {
    from: string;
    to: string;
    q?: string | null;
    type?: (typeof acctStructures.$inferSelect)["type"] | null;
    active?: "actives" | "inactives" | null;
    impayes?: boolean;
    // Fiche client (étape 51) : agrégats d'une seule structure.
    structureId?: string | null;
  }
): Promise<StructureWithAggregates[]> {
  assertCan(actor, "accounting:read");

  const clauses = [sql`TRUE`];
  if (options.structureId) clauses.push(sql`s.id = ${options.structureId}`);
  if (options.q) {
    const like = `%${options.q}%`;
    clauses.push(
      sql`(s.name ILIKE ${like} OR s.code ILIKE ${like} OR s.company ILIKE ${like})`
    );
  }
  if (options.type) clauses.push(sql`s.type = ${options.type}`);
  if (options.active === "actives") clauses.push(sql`s.is_active = TRUE`);
  if (options.active === "inactives") clauses.push(sql`s.is_active = FALSE`);
  const where = sql.join(clauses, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      s.id, s.code, s.name, s.company, s.city, s.type,
      s.is_active AS "isActive",
      s.credit_available::text AS "creditAvailable",
      COUNT(i.id) FILTER (
        WHERE i.piece_date BETWEEN ${options.from} AND ${options.to}
      )::int AS "pieceCount",
      COALESCE(SUM(i.amount_ht) FILTER (
        WHERE i.account_class = 'PRODUIT' AND i.status <> 'ANNULEE'
          AND i.piece_date BETWEEN ${options.from} AND ${options.to}
      ), 0)::text AS "revenueHT",
      COALESCE(SUM(i.amount_ht) FILTER (
        WHERE i.account_class = 'CHARGE' AND i.status <> 'ANNULEE'
          AND i.piece_date BETWEEN ${options.from} AND ${options.to}
      ), 0)::text AS "expensesHT",
      COALESCE(SUM(i.amount_ttc) FILTER (
        WHERE i.status IN ('EN_ATTENTE', 'EN_RETARD', 'IMPAYEE')
      ), 0)::text AS "amountDue",
      MAX(i.piece_date)::text AS "lastPieceDate"
    FROM acct_structures s
    LEFT JOIN acct_invoices i ON i.structure_id = s.id
    WHERE ${where}
    GROUP BY s.id
    ORDER BY s.code
  `);

  const rows = result.rows as (Omit<StructureWithAggregates, "result">)[];
  const withResult = rows.map((row) => ({
    ...row,
    revenueHT: fromCents(toCents(row.revenueHT)),
    expensesHT: fromCents(toCents(row.expensesHT)),
    amountDue: fromCents(toCents(row.amountDue)),
    result: fromCents(toCents(row.revenueHT) - toCents(row.expensesHT)),
  }));
  return options.impayes
    ? withResult.filter((row) => toCents(row.amountDue) !== 0)
    : withResult;
}
