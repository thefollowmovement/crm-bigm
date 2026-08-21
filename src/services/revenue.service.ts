import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { revenueEntries, stores } from "@/db/schema";
import { auditAggregate, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import type { ParsedRevenueRow } from "@/lib/csv/revenue-import";

type EntryInsert = typeof revenueEntries.$inferInsert;

export type RevenueEntryInput = {
  storeId: string;
  date: string;
  channel: EntryInsert["channel"];
  channelLabel: string | null;
  grossAmount: string;
  netAmount: string | null;
};

// Saisie manuelle : crée ou ÉCRASE la ligne (boutique, date, canal) — c'est le
// comportement attendu pour corriger une saisie. Auditée ligne à ligne.
export async function upsertEntry(actor: SessionUser, input: RevenueEntryInput) {
  assertCan(actor, "revenue:write");
  await assertStoreAccess(actor, input.storeId);

  const existing = await db.query.revenueEntries.findFirst({
    where: and(
      eq(revenueEntries.storeId, input.storeId),
      eq(revenueEntries.date, input.date),
      eq(revenueEntries.channel, input.channel)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, revenueEntries, existing.id, {
      grossAmount: input.grossAmount,
      netAmount: input.netAmount,
      channelLabel: input.channelLabel,
      source: "SAISIE",
      enteredById: actor.id,
    });
  }
  return auditedInsert({ id: actor.id }, revenueEntries, {
    ...input,
    source: "SAISIE",
    enteredById: actor.id,
  });
}

export type ImportResult = {
  imported: number;
  updated: number;
  errors: { line?: number; storeCode: string; message: string }[];
};

// Import CSV : upsert en lot sur la contrainte unique + UN SEUL log d'audit
// agrégé (règle CLAUDE.md n°3 — pas de log par ligne pour un import).
export async function importRows(
  actor: SessionUser,
  rows: ParsedRevenueRow[]
): Promise<ImportResult> {
  assertCan(actor, "revenue:import");

  const codes = [...new Set(rows.map((r) => r.storeCode))];
  const knownStores = codes.length
    ? await db.query.stores.findMany({
        where: inArray(stores.code, codes),
        columns: { id: true, code: true },
      })
    : [];
  const byCode = new Map(knownStores.map((s) => [s.code, s.id]));

  const errors: ImportResult["errors"] = [];
  const valid: (ParsedRevenueRow & { storeId: string })[] = [];
  for (const row of rows) {
    const storeId = byCode.get(row.storeCode);
    if (!storeId) {
      errors.push({
        storeCode: row.storeCode,
        message: `Code boutique inconnu : « ${row.storeCode} ».`,
      });
      continue;
    }
    valid.push({ ...row, storeId });
  }

  let imported = 0;
  let updated = 0;
  const byStore: Record<string, number> = {};

  if (valid.length > 0) {
    // xmax = 0 → ligne insérée ; sinon → ligne mise à jour par ON CONFLICT.
    const result = await db
      .insert(revenueEntries)
      .values(
        valid.map((row) => ({
          storeId: row.storeId,
          date: row.date,
          channel: row.channel,
          channelLabel: row.channelLabel,
          grossAmount: row.grossAmount,
          netAmount: row.netAmount,
          source: "IMPORT_CSV" as const,
          enteredById: actor.id,
        }))
      )
      .onConflictDoUpdate({
        target: [revenueEntries.storeId, revenueEntries.date, revenueEntries.channel],
        set: {
          grossAmount: sql`excluded.gross_amount`,
          netAmount: sql`excluded.net_amount`,
          channelLabel: sql`excluded.channel_label`,
          source: sql`excluded.source`,
          enteredById: sql`excluded.entered_by_id`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

    for (const row of result) {
      if (row.inserted) imported += 1;
      else updated += 1;
    }
    for (const row of valid) {
      byStore[row.storeCode] = (byStore[row.storeCode] ?? 0) + 1;
    }

    await auditAggregate(
      { id: actor.id },
      {
        action: "IMPORT",
        tableName: "revenue_entries",
        recordId: randomUUID(),
        snapshot: { imported, updated, errorCount: errors.length, byStore },
      }
    );
  }

  return { imported, updated, errors };
}

// Entrées + totaux d'un mois pour une boutique (sommes en SQL, strings).
export async function getStoreMonth(
  actor: SessionUser,
  storeId: string,
  month: string // "YYYY-MM"
) {
  assertCan(actor, "revenue:read");
  await assertStoreAccess(actor, storeId);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mois invalide.");
  const from = `${month}-01`;
  const to = `${month}-31`;

  const [entries, totals, [grand]] = await Promise.all([
    db.query.revenueEntries.findMany({
      where: and(
        eq(revenueEntries.storeId, storeId),
        gte(revenueEntries.date, from),
        lte(revenueEntries.date, to)
      ),
      orderBy: [asc(revenueEntries.date), asc(revenueEntries.channel)],
      with: {
        enteredBy: { columns: { firstName: true, lastName: true } },
      },
    }),
    db
      .select({
        channel: revenueEntries.channel,
        gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
        net: sql<string>`COALESCE(SUM(${revenueEntries.netAmount}), 0)::text`,
      })
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.storeId, storeId),
          gte(revenueEntries.date, from),
          lte(revenueEntries.date, to)
        )
      )
      .groupBy(revenueEntries.channel),
    db
      .select({
        gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      })
      .from(revenueEntries)
      .where(
        and(
          eq(revenueEntries.storeId, storeId),
          gte(revenueEntries.date, from),
          lte(revenueEntries.date, to)
        )
      ),
  ]);

  return { entries, totals, grandTotal: grand.gross };
}

// Comparatif réseau : total brut par boutique sur une période.
// Rôles siège : toutes les boutiques ; franchisé : les siennes.
export async function getNetworkSummary(
  actor: SessionUser,
  period: { from: string; to: string }
) {
  assertCan(actor, "revenue:read");
  const conditions: SQL[] = [
    gte(revenueEntries.date, period.from),
    lte(revenueEntries.date, period.to),
  ];
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(revenueEntries.storeId, scoped));
  }

  return db
    .select({
      storeId: stores.id,
      code: stores.code,
      name: stores.name,
      gross: sql<string>`COALESCE(SUM(${revenueEntries.grossAmount}), 0)::text`,
      entryCount: sql<number>`COUNT(*)::int`,
    })
    .from(revenueEntries)
    .innerJoin(stores, eq(revenueEntries.storeId, stores.id))
    .where(and(...conditions))
    .groupBy(stores.id, stores.code, stores.name)
    .orderBy(desc(sql`SUM(${revenueEntries.grossAmount})`));
}
