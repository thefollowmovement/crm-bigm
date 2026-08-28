import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { depots, dpsPurchases, stores } from "@/db/schema";
import { auditAggregate, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import {
  accessibleStoreIds,
  assertCan,
  assertStoreAccess,
} from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { monthEndIso } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import { sumStoreRevenueByMonth } from "@/services/acct-analytics.service";
import type { ParsedPurchaseRow } from "@/lib/csv/purchase-import";

// Achats DPS (cdc §4) : montants, fréquence, évolution et comparaison au CA.
// Import CSV idempotent sur (boutique, date, référence BL).

// ── Dépôts ───────────────────────────────────────────────────────

export async function listDepots(
  actor: SessionUser,
  options: { includeInactive?: boolean } = {}
) {
  assertCan(actor, "purchase:read");
  return db.query.depots.findMany({
    where: options.includeInactive ? undefined : eq(depots.isActive, true),
    orderBy: [asc(depots.code)],
  });
}

export async function createDepot(
  actor: SessionUser,
  input: { code: string; name: string; city: string | null }
) {
  assertCan(actor, "purchase:write");
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) throw new Error("Le code du dépôt est obligatoire.");
  if (!name) throw new Error("Le nom du dépôt est obligatoire.");
  const existing = await db.query.depots.findFirst({ where: eq(depots.code, code) });
  if (existing) throw new Error(`Le code dépôt « ${code} » existe déjà.`);
  return auditedInsert({ id: actor.id }, depots, { code, name, city: input.city });
}

export async function updateDepot(
  actor: SessionUser,
  id: string,
  patch: { name?: string; city?: string | null; isActive?: boolean }
) {
  assertCan(actor, "purchase:write");
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Le nom du dépôt est obligatoire.");
  }
  return auditedUpdate({ id: actor.id }, depots, id, patch);
}

// ── Saisie & import des achats ───────────────────────────────────

export type PurchaseInput = {
  storeId: string;
  depotId: string;
  date: string;
  reference: string;
  amount: string;
  notes: string | null;
};

// Crée ou remplace l'achat (boutique, date, référence) — corrige une saisie.
export async function upsertPurchase(actor: SessionUser, input: PurchaseInput) {
  assertCan(actor, "purchase:write");
  await assertStoreAccess(actor, input.storeId);
  const depot = await db.query.depots.findFirst({
    where: eq(depots.id, input.depotId),
  });
  if (!depot || !depot.isActive) throw new Error("Dépôt introuvable.");
  const reference = input.reference.trim();
  if (!reference) throw new Error("La référence (BL / facture) est obligatoire.");

  const existing = await db.query.dpsPurchases.findFirst({
    where: and(
      eq(dpsPurchases.storeId, input.storeId),
      eq(dpsPurchases.date, input.date),
      eq(dpsPurchases.reference, reference)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, dpsPurchases, existing.id, {
      depotId: input.depotId,
      amount: input.amount,
      notes: input.notes,
      source: "SAISIE",
      enteredById: actor.id,
    });
  }
  return auditedInsert({ id: actor.id }, dpsPurchases, {
    ...input,
    reference,
    source: "SAISIE",
    enteredById: actor.id,
  });
}

export type PurchaseImportResult = {
  imported: number;
  updated: number;
  errors: { line?: number; storeCode: string; message: string }[];
};

// Import CSV : upsert en lot + UN SEUL log d'audit agrégé.
export async function importRows(
  actor: SessionUser,
  rows: ParsedPurchaseRow[]
): Promise<PurchaseImportResult> {
  assertCan(actor, "purchase:import");

  const storeCodes = [...new Set(rows.map((r) => r.storeCode))];
  const depotCodes = [...new Set(rows.map((r) => r.depotCode))];
  const [knownStores, knownDepots] = await Promise.all([
    storeCodes.length
      ? db.query.stores.findMany({
          where: inArray(stores.code, storeCodes),
          columns: { id: true, code: true },
        })
      : [],
    depotCodes.length
      ? db.query.depots.findMany({
          where: inArray(depots.code, depotCodes),
          columns: { id: true, code: true },
        })
      : [],
  ]);
  const storeByCode = new Map(knownStores.map((s) => [s.code, s.id]));
  const depotByCode = new Map(knownDepots.map((d) => [d.code, d.id]));

  const errors: PurchaseImportResult["errors"] = [];
  const valid: (ParsedPurchaseRow & { storeId: string; depotId: string })[] = [];
  for (const row of rows) {
    const storeId = storeByCode.get(row.storeCode);
    if (!storeId) {
      errors.push({
        storeCode: row.storeCode,
        message: `Code boutique inconnu : « ${row.storeCode} ».`,
      });
      continue;
    }
    const depotId = depotByCode.get(row.depotCode);
    if (!depotId) {
      errors.push({
        storeCode: row.storeCode,
        message: `Code dépôt inconnu : « ${row.depotCode} ».`,
      });
      continue;
    }
    valid.push({ ...row, storeId, depotId });
  }

  let imported = 0;
  let updated = 0;

  if (valid.length > 0) {
    const result = await db
      .insert(dpsPurchases)
      .values(
        valid.map((row) => ({
          storeId: row.storeId,
          depotId: row.depotId,
          date: row.date,
          reference: row.reference,
          amount: row.amount,
          source: "IMPORT_CSV" as const,
          enteredById: actor.id,
        }))
      )
      .onConflictDoUpdate({
        target: [dpsPurchases.storeId, dpsPurchases.date, dpsPurchases.reference],
        set: {
          depotId: sql`excluded.depot_id`,
          amount: sql`excluded.amount`,
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

    await auditAggregate(
      { id: actor.id },
      {
        action: "IMPORT",
        tableName: "dps_purchases",
        recordId: randomUUID(),
        snapshot: { imported, updated, errorCount: errors.length },
      }
    );
  }

  return { imported, updated, errors };
}

// ── Lectures ─────────────────────────────────────────────────────

export async function getStorePurchases(
  actor: SessionUser,
  storeId: string,
  month: string // "YYYY-MM"
) {
  assertCan(actor, "purchase:read");
  await assertStoreAccess(actor, storeId);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mois invalide.");

  const rows = await db.query.dpsPurchases.findMany({
    where: and(
      eq(dpsPurchases.storeId, storeId),
      gte(dpsPurchases.date, `${month}-01`),
      lte(dpsPurchases.date, monthEndIso(month))
    ),
    orderBy: [desc(dpsPurchases.date)],
    with: { depot: { columns: { code: true, name: true } } },
  });
  const [total] = await db
    .select({
      amount: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::text`,
    })
    .from(dpsPurchases)
    .where(
      and(
        eq(dpsPurchases.storeId, storeId),
        gte(dpsPurchases.date, `${month}-01`),
        lte(dpsPurchases.date, monthEndIso(month))
      )
    );
  return { rows, total: total.amount };
}

export type PurchasesVsRevenueRow = {
  period: string; // "YYYY-MM"
  purchases: string;
  revenue: string;
  ratioPct: string | null; // achats / CA en %, 1 décimale
};

// Achats vs CA par mois (cdc §4). Depuis l'étape 52, le CA vient du journal
// comptable : classe 7 HT des structures rattachées aux boutiques
// (acctStructures.storeId) — une boutique sans structure liée a un CA nul.
export async function getPurchasesVsRevenue(
  actor: SessionUser,
  filter: { from: string; to: string; storeId?: string; region?: string }
): Promise<PurchasesVsRevenueRow[]> {
  assertCan(actor, "purchase:read");
  if (filter.storeId) await assertStoreAccess(actor, filter.storeId);

  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null && scoped.length === 0) return [];

  const purchaseConditions: SQL[] = [
    gte(dpsPurchases.date, filter.from),
    lte(dpsPurchases.date, filter.to),
  ];
  if (filter.storeId) {
    purchaseConditions.push(eq(dpsPurchases.storeId, filter.storeId));
  }
  if (filter.region) {
    purchaseConditions.push(eq(stores.region, filter.region));
  }
  if (scoped !== null) {
    purchaseConditions.push(inArray(dpsPurchases.storeId, scoped));
  }

  const purchaseBucket = sql<string>`to_char(date_trunc('month', ${dpsPurchases.date}), 'YYYY-MM')`;

  const [purchaseRows, revenueRows] = await Promise.all([
    db
      .select({
        period: purchaseBucket,
        total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::text`,
      })
      .from(dpsPurchases)
      .innerJoin(stores, eq(dpsPurchases.storeId, stores.id))
      .where(and(...purchaseConditions))
      .groupBy(purchaseBucket),
    sumStoreRevenueByMonth({
      from: filter.from,
      to: filter.to,
      storeId: filter.storeId ?? null,
      storeIds: scoped,
      region: filter.region ?? null,
    }),
  ]);

  const purchasesByMonth = new Map(purchaseRows.map((r) => [r.period, r.total]));
  const revenueByMonth = new Map<string, number>();
  for (const row of revenueRows) {
    revenueByMonth.set(
      row.month,
      (revenueByMonth.get(row.month) ?? 0) + toCents(row.revenueHT)
    );
  }
  const months = [...new Set([...purchasesByMonth.keys(), ...revenueByMonth.keys()])].sort();

  return months.map((period) => {
    const purchases = purchasesByMonth.get(period) ?? "0";
    const revenueCents = revenueByMonth.get(period) ?? 0;
    const revenue = fromCents(revenueCents);
    return {
      period,
      purchases,
      revenue,
      ratioPct: purchaseRatioPct(purchases, revenue),
    };
  });
}

// Ratio achats/CA en % (1 décimale) — arithmétique en CENTIMES ENTIERS
// (produit exact < 2^53), null si le CA est nul. Fonction pure testée.
export function purchaseRatioPct(purchases: string, revenue: string): string | null {
  const revenueCents = toCents(revenue);
  if (revenueCents === 0) return null;
  const purchasesCents = toCents(purchases);
  const tenths = Math.round((purchasesCents * 1000) / revenueCents);
  return (tenths / 10).toFixed(1);
}

// Total des achats par dépôt sur une période.
export async function getDepotSummary(
  actor: SessionUser,
  period: { from: string; to: string }
) {
  assertCan(actor, "purchase:read");
  const conditions: SQL[] = [
    gte(dpsPurchases.date, period.from),
    lte(dpsPurchases.date, period.to),
  ];
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return [];
    conditions.push(inArray(dpsPurchases.storeId, scoped));
  }
  return db
    .select({
      depotId: depots.id,
      code: depots.code,
      name: depots.name,
      total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::text`,
      purchaseCount: sql<number>`COUNT(*)::int`,
    })
    .from(dpsPurchases)
    .innerJoin(depots, eq(dpsPurchases.depotId, depots.id))
    .where(and(...conditions))
    .groupBy(depots.id, depots.code, depots.name)
    .orderBy(desc(sql`SUM(${dpsPurchases.amount})`));
}
