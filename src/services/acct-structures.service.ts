import "server-only";

import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { acctImports, acctStructures } from "@/db/schema";
import { auditAggregate, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import { saveUpload } from "@/lib/files/storage";
import {
  parseStructureRows,
  type ParsedStructureRow,
} from "@/lib/import/structures-import";
import { readTabularFile } from "@/lib/import/tabular";
import type { SessionUser } from "@/lib/auth/session";

export type AcctStructure = typeof acctStructures.$inferSelect;
export type AcctImportReport = typeof acctImports.$inferSelect;

const BATCH_SIZE = 200;
const MAX_REPORT_ERRORS = 200;

// ── Lecture ──────────────────────────────────────────────────────

export type StructureFilters = {
  q?: string | null;
  type?: AcctStructure["type"] | null;
  active?: "actives" | "inactives" | null;
};

export async function listStructures(
  actor: SessionUser,
  filters: StructureFilters = {}
) {
  assertCan(actor, "accounting:read");
  const conditions = [];
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(acctStructures.name, like),
        ilike(acctStructures.code, like),
        ilike(acctStructures.company, like)
      )
    );
  }
  if (filters.type) conditions.push(eq(acctStructures.type, filters.type));
  if (filters.active === "actives") conditions.push(eq(acctStructures.isActive, true));
  if (filters.active === "inactives")
    conditions.push(eq(acctStructures.isActive, false));

  return db.query.acctStructures.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: [asc(acctStructures.code)],
    with: { store: { columns: { id: true, name: true } } },
  });
}

export async function getStructure(actor: SessionUser, id: string) {
  assertCan(actor, "accounting:read");
  return db.query.acctStructures.findFirst({
    where: eq(acctStructures.id, id),
    with: { store: { columns: { id: true, name: true } } },
  });
}

// ── Écriture unitaire ────────────────────────────────────────────

export type StructureInput = {
  code: string;
  name: string;
  company?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  creditAvailable?: string | null;
  lastOrderDate?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatNumber?: string | null;
  siret?: string | null;
  type: AcctStructure["type"];
  storeId?: string | null;
  notes?: string | null;
};

export async function createStructure(actor: SessionUser, input: StructureInput) {
  assertCan(actor, "accounting:write");
  const existing = await db.query.acctStructures.findFirst({
    where: eq(acctStructures.code, input.code),
    columns: { id: true },
  });
  if (existing) {
    throw new Error(`Le code « ${input.code} » existe déjà dans le référentiel.`);
  }
  return auditedInsert(actor, acctStructures, input);
}

export async function updateStructure(
  actor: SessionUser,
  id: string,
  input: Partial<StructureInput> & { isActive?: boolean }
) {
  assertCan(actor, "accounting:write");
  if (input.code) {
    const clash = await db.query.acctStructures.findFirst({
      where: eq(acctStructures.code, input.code),
      columns: { id: true },
    });
    if (clash && clash.id !== id) {
      throw new Error(`Le code « ${input.code} » existe déjà dans le référentiel.`);
    }
  }
  return auditedUpdate(actor, acctStructures, id, input);
}

// ── Import du référentiel (cdc §3.3) ─────────────────────────────
// Rapport détaillé persistant (acctImports), fichier original conservé,
// doublons ignorés ou mis à jour selon le mode choisi, traitement par lots
// avec progression enregistrée. Une ligne en erreur ne bloque jamais le reste.

export async function importStructures(
  actor: SessionUser,
  file: File,
  mode: "IGNORER" | "METTRE_A_JOUR"
): Promise<AcctImportReport> {
  assertCan(actor, "accounting:import");

  const buffer = Buffer.from(await file.arrayBuffer());
  const read = readTabularFile(buffer, file.name);
  if ("error" in read) throw new Error(read.error);
  const { rows, errors } = parseStructureRows(read.rows);
  if (rows.length === 0 && errors.length === 0) {
    throw new Error("Le fichier ne contient aucune ligne de données.");
  }

  // Trace de l'import + conservation du fichier original.
  const importRow = await auditedInsert(actor, acctImports, {
    kind: "STRUCTURES" as const,
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
    const codes = rows.map((r) => r.code);
    const existing = codes.length
      ? await db.query.acctStructures.findMany({
          where: inArray(acctStructures.code, codes),
          columns: { id: true, code: true },
        })
      : [];
    const idByCode = new Map(existing.map((s) => [s.code, s.id]));

    const toCreate = rows.filter((r) => !idByCode.has(r.code));
    const duplicates = rows.filter((r) => idByCode.has(r.code));

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const chunk = toCreate.slice(i, i + BATCH_SIZE);
      await db
        .insert(acctStructures)
        .values(chunk.map((row) => structureValues(row)));
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
            await tx
              .update(acctStructures)
              .set(structureValues(row, { onlyProvided: true }))
              .where(eq(acctStructures.id, idByCode.get(row.code)!));
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

    // Pas d'update/delete en masse sans trace : événement d'audit agrégé.
    await auditAggregate(actor, {
      action: "IMPORT",
      tableName: "acct_structures",
      recordId: importRow.id,
      snapshot: {
        fileName: file.name,
        format: read.format,
        mode,
        created,
        updated,
        skipped,
        errorCount: errors.length,
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

// En mode mise à jour, une cellule vide ne doit pas effacer une donnée déjà
// saisie : seules les valeurs présentes dans le fichier sont réécrites.
function structureValues(
  row: ParsedStructureRow,
  options: { onlyProvided?: boolean } = {}
) {
  const base: Record<string, unknown> = { code: row.code, name: row.name };
  const optional: [string, string | null][] = [
    ["company", row.company],
    ["contactName", row.contactName],
    ["phone", row.phone],
    ["email", row.email],
    ["creditAvailable", row.creditAvailable],
    ["lastOrderDate", row.lastOrderDate],
    ["address", row.address],
    ["postalCode", row.postalCode],
    ["city", row.city],
    ["vatNumber", row.vatNumber],
    ["siret", row.siret],
  ];
  for (const [key, value] of optional) {
    if (value !== null || !options.onlyProvided) base[key] = value;
  }
  return base as typeof acctStructures.$inferInsert;
}

export async function listImports(actor: SessionUser, kind: "STRUCTURES" | "FACTURES") {
  assertCan(actor, "accounting:read");
  return db.query.acctImports.findMany({
    where: eq(acctImports.kind, kind),
    orderBy: [desc(acctImports.createdAt)],
    limit: 20,
    with: { createdBy: { columns: { firstName: true, lastName: true } } },
  });
}
