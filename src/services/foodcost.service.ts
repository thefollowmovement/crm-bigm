import "server-only";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  depots,
  ingredientPrices,
  ingredients,
  products,
  recipeItems,
  recipes,
} from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";
import { computeRecipeCost, convertToBaseUnit, foodCostPct } from "@/lib/foodcost";

// Module Food Cost (cdc §6) : ingrédients, tarifs par dépôt historisés par
// date d'effet, recettes par produit, coût matière calculé — jamais stocké.

// ── Ingrédients & tarifs ─────────────────────────────────────────

export async function listIngredients(
  actor: SessionUser,
  options: { includeInactive?: boolean } = {}
) {
  assertCan(actor, "foodcost:read");
  return db.query.ingredients.findMany({
    where: options.includeInactive ? undefined : eq(ingredients.isActive, true),
    orderBy: [asc(ingredients.name)],
  });
}

export async function createIngredient(
  actor: SessionUser,
  input: { name: string; unit: "KG" | "L" | "PIECE" }
) {
  assertCan(actor, "foodcost:write");
  const name = input.name.trim();
  if (!name) throw new Error("Le nom de l'ingrédient est obligatoire.");
  const existing = await db.query.ingredients.findFirst({
    where: eq(ingredients.name, name),
  });
  if (existing) throw new Error(`L'ingrédient « ${name} » existe déjà.`);
  return auditedInsert({ id: actor.id }, ingredients, { name, unit: input.unit });
}

export async function updateIngredient(
  actor: SessionUser,
  id: string,
  patch: { name?: string; isActive?: boolean }
) {
  assertCan(actor, "foodcost:write");
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("Le nom de l'ingrédient est obligatoire.");
  }
  return auditedUpdate({ id: actor.id }, ingredients, id, patch);
}

// Nouveau tarif à une date d'effet — l'historique est conservé, le tarif
// applicable à une date est le dernier effectiveDate <= date.
export async function setIngredientPrice(
  actor: SessionUser,
  input: {
    ingredientId: string;
    depotId: string;
    pricePerUnit: string;
    effectiveDate: string;
  }
) {
  assertCan(actor, "foodcost:write");
  const [ingredient, depot] = await Promise.all([
    db.query.ingredients.findFirst({ where: eq(ingredients.id, input.ingredientId) }),
    db.query.depots.findFirst({ where: eq(depots.id, input.depotId) }),
  ]);
  if (!ingredient) throw new Error("Ingrédient introuvable.");
  if (!depot) throw new Error("Dépôt introuvable.");

  const existing = await db.query.ingredientPrices.findFirst({
    where: and(
      eq(ingredientPrices.ingredientId, input.ingredientId),
      eq(ingredientPrices.depotId, input.depotId),
      eq(ingredientPrices.effectiveDate, input.effectiveDate)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, ingredientPrices, existing.id, {
      pricePerUnit: input.pricePerUnit,
    });
  }
  return auditedInsert({ id: actor.id }, ingredientPrices, input);
}

// Tarifs applicables par dépôt à une date (dernier effectiveDate <= date).
export async function getApplicablePrices(
  actor: SessionUser,
  atDate?: string
): Promise<Map<string, Map<string, string>>> {
  assertCan(actor, "foodcost:read");
  const date = atDate ?? todayParis();
  const rows = await db
    .selectDistinctOn([ingredientPrices.depotId, ingredientPrices.ingredientId], {
      depotId: ingredientPrices.depotId,
      ingredientId: ingredientPrices.ingredientId,
      pricePerUnit: ingredientPrices.pricePerUnit,
    })
    .from(ingredientPrices)
    .where(lte(ingredientPrices.effectiveDate, date))
    .orderBy(
      ingredientPrices.depotId,
      ingredientPrices.ingredientId,
      desc(ingredientPrices.effectiveDate)
    );

  const byDepot = new Map<string, Map<string, string>>();
  for (const row of rows) {
    let depotMap = byDepot.get(row.depotId);
    if (!depotMap) {
      depotMap = new Map();
      byDepot.set(row.depotId, depotMap);
    }
    depotMap.set(row.ingredientId, row.pricePerUnit);
  }
  return byDepot;
}

// ── Recettes ─────────────────────────────────────────────────────

export async function listRecipes(actor: SessionUser) {
  assertCan(actor, "foodcost:read");
  return db.query.recipes.findMany({
    orderBy: [asc(recipes.createdAt)],
    with: {
      product: { with: { family: { columns: { name: true } } } },
      items: { with: { ingredient: true } },
    },
  });
}

export async function getOrCreateRecipe(actor: SessionUser, productId: string) {
  assertCan(actor, "foodcost:write");
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw new Error("Produit introuvable.");
  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.productId, productId),
  });
  if (existing) return existing;
  return auditedInsert({ id: actor.id }, recipes, { productId });
}

// Ajoute ou remplace un ingrédient de la recette (quantité en unité de base).
export async function setRecipeItem(
  actor: SessionUser,
  recipeId: string,
  input: { ingredientId: string; quantity: string }
) {
  assertCan(actor, "foodcost:write");
  const recipe = await db.query.recipes.findFirst({ where: eq(recipes.id, recipeId) });
  if (!recipe) throw new Error("Recette introuvable.");
  const ingredient = await db.query.ingredients.findFirst({
    where: eq(ingredients.id, input.ingredientId),
  });
  if (!ingredient || !ingredient.isActive) throw new Error("Ingrédient introuvable.");

  const existing = await db.query.recipeItems.findFirst({
    where: and(
      eq(recipeItems.recipeId, recipeId),
      eq(recipeItems.ingredientId, input.ingredientId)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, recipeItems, existing.id, {
      quantity: input.quantity,
    });
  }
  return auditedInsert({ id: actor.id }, recipeItems, {
    recipeId,
    ingredientId: input.ingredientId,
    quantity: input.quantity,
  });
}

// Variante depuis l'UI : quantité saisie en g / ml (solides / liquides) ou
// en pièces, convertie vers l'unité de base de l'ingrédient.
export async function setRecipeItemFromRaw(
  actor: SessionUser,
  recipeId: string,
  input: { ingredientId: string; rawQuantity: string }
) {
  assertCan(actor, "foodcost:write");
  const ingredient = await db.query.ingredients.findFirst({
    where: eq(ingredients.id, input.ingredientId),
  });
  if (!ingredient) throw new Error("Ingrédient introuvable.");
  const quantity = convertToBaseUnit(input.rawQuantity, ingredient.unit);
  return setRecipeItem(actor, recipeId, {
    ingredientId: input.ingredientId,
    quantity,
  });
}

export async function removeRecipeItem(actor: SessionUser, itemId: string) {
  assertCan(actor, "foodcost:write");
  const item = await db.query.recipeItems.findFirst({
    where: eq(recipeItems.id, itemId),
  });
  if (!item) throw new Error("Ingrédient de recette introuvable.");
  await auditedDelete({ id: actor.id }, recipeItems, itemId);
}

// Prix de vente HT d'un produit (pour le % de coût matière).
export async function setProductSalePrice(
  actor: SessionUser,
  productId: string,
  salePriceHT: string | null
) {
  assertCan(actor, "foodcost:write");
  return auditedUpdate({ id: actor.id }, products, productId, { salePriceHT });
}

// ── Synthèse : coût matière par produit × dépôt ──────────────────

export type FoodCostBoardRow = {
  productId: string;
  code: string;
  name: string;
  salePriceHT: string | null;
  missingPrices: boolean;
  costs: {
    depotId: string;
    depotCode: string;
    cost: string | null; // null si un tarif manque pour ce dépôt
    pct: string | null;
  }[];
};

export async function getFoodCostBoard(
  actor: SessionUser,
  atDate?: string
): Promise<FoodCostBoardRow[]> {
  assertCan(actor, "foodcost:read");
  const [recipeList, activeDepots, priceMap] = await Promise.all([
    db.query.recipes.findMany({
      where: eq(recipes.isActive, true),
      with: {
        product: true,
        items: true,
      },
    }),
    db.query.depots.findMany({
      where: eq(depots.isActive, true),
      orderBy: [asc(depots.code)],
    }),
    getApplicablePrices(actor, atDate),
  ]);

  return recipeList
    .filter((r) => r.product.isActive)
    .sort((a, b) => a.product.code.localeCompare(b.product.code))
    .map((recipe) => {
      let missingPrices = false;
      const costs = activeDepots.map((depot) => {
        const prices = priceMap.get(depot.id);
        const items: { quantity: string; pricePerUnit: string }[] = [];
        let missing = recipe.items.length === 0;
        for (const item of recipe.items) {
          const price = prices?.get(item.ingredientId);
          if (!price) {
            missing = true;
            break;
          }
          items.push({ quantity: item.quantity, pricePerUnit: price });
        }
        if (missing) {
          missingPrices = true;
          return { depotId: depot.id, depotCode: depot.code, cost: null, pct: null };
        }
        const cost = computeRecipeCost(items);
        return {
          depotId: depot.id,
          depotCode: depot.code,
          cost,
          pct: foodCostPct(cost, recipe.product.salePriceHT),
        };
      });
      return {
        productId: recipe.product.id,
        code: recipe.product.code,
        name: recipe.product.name,
        salePriceHT: recipe.product.salePriceHT,
        missingPrices,
        costs,
      };
    });
}

// Coût matière d'un produit pour le dépôt d'une boutique donnée.
export async function getProductCost(
  actor: SessionUser,
  productId: string,
  depotId: string,
  atDate?: string
): Promise<{ cost: string; pct: string | null } | null> {
  assertCan(actor, "foodcost:read");
  const recipe = await db.query.recipes.findFirst({
    where: and(eq(recipes.productId, productId), eq(recipes.isActive, true)),
    with: { product: true, items: true },
  });
  if (!recipe || recipe.items.length === 0) return null;

  const date = atDate ?? todayParis();
  const priceRows = await db
    .selectDistinctOn([ingredientPrices.ingredientId], {
      ingredientId: ingredientPrices.ingredientId,
      pricePerUnit: ingredientPrices.pricePerUnit,
    })
    .from(ingredientPrices)
    .where(
      and(
        eq(ingredientPrices.depotId, depotId),
        inArray(
          ingredientPrices.ingredientId,
          recipe.items.map((i) => i.ingredientId)
        ),
        lte(ingredientPrices.effectiveDate, date)
      )
    )
    .orderBy(ingredientPrices.ingredientId, desc(ingredientPrices.effectiveDate));
  const prices = new Map(priceRows.map((r) => [r.ingredientId, r.pricePerUnit]));

  const items: { quantity: string; pricePerUnit: string }[] = [];
  for (const item of recipe.items) {
    const price = prices.get(item.ingredientId);
    if (!price) return null;
    items.push({ quantity: item.quantity, pricePerUnit: price });
  }
  const cost = computeRecipeCost(items);
  return { cost, pct: foodCostPct(cost, recipe.product.salePriceHT) };
}
