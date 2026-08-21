import "server-only";

import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  dpsPurchases,
  productSales,
  products,
  recipeItems,
  recipes,
  stores,
} from "@/db/schema";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { toTenThousandths } from "@/lib/foodcost";
import { fromCents, toCents } from "@/lib/money";
import { getApplicablePrices } from "@/services/foodcost.service";

// Écart matière (cdc §4/§8) : consommation THÉORIQUE (ventes produits ×
// recettes, valorisées au tarif du dépôt de la boutique) vs achats DPS réels.
// Rien n'est stocké — tout se dérive à la demande.

// ── Décisions pures (testées en unit) ────────────────────────────

// Coût matière théorique d'une vente : Σ (quantité recette × tarif) × qté
// vendue — entiers en 10^-8 €, arrondi half-up au centime À LA FIN.
export function theoreticalCostCents(
  items: { quantity: string; pricePerUnit: string }[],
  soldQuantity: number
): number {
  if (!Number.isInteger(soldQuantity) || soldQuantity < 0) {
    throw new Error(`Quantité vendue invalide : ${soldQuantity}.`);
  }
  let hundredMillionths = BigInt(0);
  for (const item of items) {
    hundredMillionths +=
      toTenThousandths(item.quantity) * toTenThousandths(item.pricePerUnit);
  }
  const total = hundredMillionths * BigInt(soldQuantity);
  const cents = (total + BigInt(500_000)) / BigInt(1_000_000);
  return Number(cents);
}

// Écart en % du théorique (1 décimale) ; null si théorique nul.
export function variancePct(
  actualCents: number,
  theoreticalCents: number
): number | null {
  if (theoreticalCents === 0) return null;
  return (
    Math.round(((actualCents - theoreticalCents) * 1000) / theoreticalCents) / 10
  );
}

// ── Lectures ─────────────────────────────────────────────────────

export type StoreVariance = {
  store: { id: string; code: string; name: string };
  theoretical: string;
  actual: string;
  variance: string; // réel − théorique
  variancePct: number | null;
  // produits vendus sans recette ou ingrédient sans tarif au dépôt
  missingProducts: string[];
};

// Écart matière par boutique sur un mois civil. Seules les boutiques
// rattachées à un dépôt et ayant des ventes produits sont évaluées.
export async function getMaterialVariance(
  actor: SessionUser,
  year: number,
  month: number
): Promise<StoreVariance[]> {
  assertCan(actor, "foodcost:read");
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const toExclusive =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const [salesRows, purchaseRows, storeRows, recipeRows, prices] =
    await Promise.all([
      db
        .select({
          storeId: productSales.storeId,
          productId: productSales.productId,
          quantity: sql<number>`SUM(${productSales.quantity})::int`,
        })
        .from(productSales)
        .where(and(gte(productSales.date, from), lt(productSales.date, toExclusive)))
        .groupBy(productSales.storeId, productSales.productId),
      db
        .select({
          storeId: dpsPurchases.storeId,
          total: sql<string>`COALESCE(SUM(${dpsPurchases.amount}), 0)::numeric(12,2)::text`,
        })
        .from(dpsPurchases)
        .where(and(gte(dpsPurchases.date, from), lt(dpsPurchases.date, toExclusive)))
        .groupBy(dpsPurchases.storeId),
      db.query.stores.findMany({
        where: isNotNull(stores.depotId),
        columns: { id: true, code: true, name: true, depotId: true },
      }),
      db
        .select({
          productId: recipes.productId,
          productName: products.name,
          ingredientId: recipeItems.ingredientId,
          quantity: recipeItems.quantity,
        })
        .from(recipeItems)
        .innerJoin(recipes, eq(recipeItems.recipeId, recipes.id))
        .innerJoin(products, eq(recipes.productId, products.id)),
      // tarifs applicables au dernier jour du mois demandé
      getApplicablePrices(
        actor,
        `${year}-${String(month).padStart(2, "0")}-28`
      ),
    ]);

  // items de recette par produit + noms
  const recipeByProduct = new Map<
    string,
    { name: string; items: { ingredientId: string; quantity: string }[] }
  >();
  for (const row of recipeRows) {
    const entry = recipeByProduct.get(row.productId) ?? {
      name: row.productName,
      items: [],
    };
    entry.items.push({ ingredientId: row.ingredientId, quantity: row.quantity });
    recipeByProduct.set(row.productId, entry);
  }

  const productNames = new Map<string, string>();
  const allProducts = await db.query.products.findMany({
    columns: { id: true, name: true },
  });
  for (const p of allProducts) productNames.set(p.id, p.name);

  const purchasesByStore = new Map(purchaseRows.map((r) => [r.storeId, r.total]));
  const salesByStore = new Map<string, { productId: string; quantity: number }[]>();
  for (const row of salesRows) {
    const list = salesByStore.get(row.storeId) ?? [];
    list.push({ productId: row.productId, quantity: row.quantity });
    salesByStore.set(row.storeId, list);
  }

  const result: StoreVariance[] = [];
  for (const store of storeRows) {
    const sales = salesByStore.get(store.id) ?? [];
    const actual = purchasesByStore.get(store.id) ?? "0.00";
    if (sales.length === 0 && actual === "0.00") continue;

    const depotPrices = prices.get(store.depotId!) ?? new Map<string, string>();
    let theoreticalTotal = 0;
    const missing = new Set<string>();

    for (const sale of sales) {
      const recipe = recipeByProduct.get(sale.productId);
      if (!recipe) {
        missing.add(productNames.get(sale.productId) ?? sale.productId);
        continue;
      }
      const pricedItems: { quantity: string; pricePerUnit: string }[] = [];
      let priceMissing = false;
      for (const item of recipe.items) {
        const price = depotPrices.get(item.ingredientId);
        if (!price) {
          priceMissing = true;
          break;
        }
        pricedItems.push({ quantity: item.quantity, pricePerUnit: price });
      }
      if (priceMissing) {
        missing.add(recipe.name);
        continue;
      }
      theoreticalTotal += theoreticalCostCents(pricedItems, sale.quantity);
    }

    const actualCents = toCents(actual);
    result.push({
      store: { id: store.id, code: store.code, name: store.name },
      theoretical: fromCents(theoreticalTotal),
      actual,
      variance: fromCents(actualCents - theoreticalTotal),
      variancePct: variancePct(actualCents, theoreticalTotal),
      missingProducts: [...missing].sort(),
    });
  }

  return result.sort(
    (a, b) => Math.abs(toCents(b.variance)) - Math.abs(toCents(a.variance))
  );
}
