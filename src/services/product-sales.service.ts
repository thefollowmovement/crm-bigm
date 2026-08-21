import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { productFamilies, products, productSales, stores } from "@/db/schema";
import { auditAggregate } from "@/lib/db/audited";
import { accessibleStoreIds, assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import type { ParsedProductSaleRow } from "@/lib/csv/product-sales-import";

// Ventes par produit (cdc §17) : import CSV idempotent + agrégats top
// produits / familles. Prépare la chaîne écart matière (phase 5).

export type ProductSalesImportResult = {
  imported: number;
  updated: number;
  errors: { line?: number; storeCode: string; message: string }[];
};

// Import CSV : upsert en lot sur (boutique, date, produit) + UN SEUL log
// d'audit agrégé — même contrat que l'import de CA.
export async function importRows(
  actor: SessionUser,
  rows: ParsedProductSaleRow[]
): Promise<ProductSalesImportResult> {
  assertCan(actor, "revenue:import");

  const storeCodes = [...new Set(rows.map((r) => r.storeCode))];
  const productCodes = [...new Set(rows.map((r) => r.productCode))];
  const [knownStores, knownProducts] = await Promise.all([
    storeCodes.length
      ? db.query.stores.findMany({
          where: inArray(stores.code, storeCodes),
          columns: { id: true, code: true },
        })
      : [],
    productCodes.length
      ? db.query.products.findMany({
          where: inArray(products.code, productCodes),
          columns: { id: true, code: true },
        })
      : [],
  ]);
  const storeByCode = new Map(knownStores.map((s) => [s.code, s.id]));
  const productByCode = new Map(knownProducts.map((p) => [p.code, p.id]));

  const errors: ProductSalesImportResult["errors"] = [];
  const valid: (ParsedProductSaleRow & { storeId: string; productId: string })[] = [];
  for (const row of rows) {
    const storeId = storeByCode.get(row.storeCode);
    if (!storeId) {
      errors.push({
        storeCode: row.storeCode,
        message: `Code boutique inconnu : « ${row.storeCode} ».`,
      });
      continue;
    }
    const productId = productByCode.get(row.productCode);
    if (!productId) {
      errors.push({
        storeCode: row.storeCode,
        message: `Code produit inconnu : « ${row.productCode} » (à créer dans le référentiel).`,
      });
      continue;
    }
    valid.push({ ...row, storeId, productId });
  }

  let imported = 0;
  let updated = 0;

  if (valid.length > 0) {
    // xmax = 0 → ligne insérée ; sinon → mise à jour par ON CONFLICT.
    const result = await db
      .insert(productSales)
      .values(
        valid.map((row) => ({
          storeId: row.storeId,
          date: row.date,
          productId: row.productId,
          quantity: row.quantity,
          amount: row.amount,
          source: "IMPORT_CSV" as const,
          enteredById: actor.id,
        }))
      )
      .onConflictDoUpdate({
        target: [productSales.storeId, productSales.date, productSales.productId],
        set: {
          quantity: sql`excluded.quantity`,
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
        tableName: "product_sales",
        recordId: randomUUID(),
        snapshot: { imported, updated, errorCount: errors.length },
      }
    );
  }

  return { imported, updated, errors };
}

type PeriodFilter = { from: string; to: string; storeId?: string };

// Conditions communes : période + boutique éventuelle + scoping FRANCHISE.
async function buildConditions(
  actor: SessionUser,
  filter: PeriodFilter
): Promise<SQL[] | null> {
  const conditions: SQL[] = [
    gte(productSales.date, filter.from),
    lte(productSales.date, filter.to),
  ];
  if (filter.storeId) conditions.push(eq(productSales.storeId, filter.storeId));
  const scoped = await accessibleStoreIds(actor);
  if (scoped !== null) {
    if (scoped.length === 0) return null;
    conditions.push(inArray(productSales.storeId, scoped));
  }
  return conditions;
}

export type TopProductRow = {
  productId: string;
  code: string;
  name: string;
  familyName: string;
  quantity: number;
  amount: string;
};

// Meilleures ventes sur une période (tri quantité décroissante).
export async function getTopProducts(
  actor: SessionUser,
  filter: PeriodFilter & { limit?: number }
): Promise<TopProductRow[]> {
  assertCan(actor, "revenue:read");
  const conditions = await buildConditions(actor, filter);
  if (conditions === null) return [];

  return db
    .select({
      productId: products.id,
      code: products.code,
      name: products.name,
      familyName: productFamilies.name,
      quantity: sql<number>`COALESCE(SUM(${productSales.quantity}), 0)::int`,
      amount: sql<string>`COALESCE(SUM(${productSales.amount}), 0)::text`,
    })
    .from(productSales)
    .innerJoin(products, eq(productSales.productId, products.id))
    .innerJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .groupBy(products.id, products.code, products.name, productFamilies.name)
    .orderBy(desc(sql`SUM(${productSales.quantity})`))
    .limit(filter.limit ?? 15);
}

export type FamilyBreakdownRow = {
  familyId: string;
  familyName: string;
  quantity: number;
  amount: string;
};

// Répartition des ventes par famille de produits.
export async function getFamilyBreakdown(
  actor: SessionUser,
  filter: PeriodFilter
): Promise<FamilyBreakdownRow[]> {
  assertCan(actor, "revenue:read");
  const conditions = await buildConditions(actor, filter);
  if (conditions === null) return [];

  return db
    .select({
      familyId: productFamilies.id,
      familyName: productFamilies.name,
      quantity: sql<number>`COALESCE(SUM(${productSales.quantity}), 0)::int`,
      amount: sql<string>`COALESCE(SUM(${productSales.amount}), 0)::text`,
    })
    .from(productSales)
    .innerJoin(products, eq(productSales.productId, products.id))
    .innerJoin(productFamilies, eq(products.familyId, productFamilies.id))
    .where(and(...conditions))
    .groupBy(productFamilies.id, productFamilies.name)
    .orderBy(desc(sql`SUM(${productSales.quantity})`));
}
