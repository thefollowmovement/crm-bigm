import "server-only";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  depots,
  ingredientPrices,
  ingredients,
  menuItems,
  menus,
  products,
  recipeItems,
  recipes,
} from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";
import {
  computeRecipeCost,
  convertToBaseUnit,
  foodCostPct,
  scaleAmount,
} from "@/lib/foodcost";
import { addAmounts } from "@/lib/money";

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

// ── Menus / formules (burger + frites + boisson + emballages) ────

export async function listMenus(actor: SessionUser) {
  assertCan(actor, "foodcost:read");
  return db.query.menus.findMany({
    orderBy: [asc(menus.name)],
    with: {
      items: {
        with: {
          product: { columns: { id: true, code: true, name: true } },
          ingredient: { columns: { id: true, name: true, unit: true } },
        },
      },
    },
  });
}

export async function createMenu(
  actor: SessionUser,
  input: { name: string; salePriceHT: string | null }
) {
  assertCan(actor, "foodcost:write");
  const name = input.name.trim();
  if (!name) throw new Error("Le nom du menu est obligatoire.");
  const existing = await db.query.menus.findFirst({ where: eq(menus.name, name) });
  if (existing) throw new Error(`Le menu « ${name} » existe déjà.`);
  return auditedInsert({ id: actor.id }, menus, {
    name,
    salePriceHT: input.salePriceHT,
  });
}

export async function setMenuSalePrice(
  actor: SessionUser,
  menuId: string,
  salePriceHT: string | null
) {
  assertCan(actor, "foodcost:write");
  return auditedUpdate({ id: actor.id }, menus, menuId, { salePriceHT });
}

// Ajoute (ou remplace) une ligne du menu : un produit (quantité = nombre
// d'unités) OU un ingrédient direct type emballage (quantité en g/ml/pièces,
// convertie vers l'unité de base).
export async function setMenuItem(
  actor: SessionUser,
  menuId: string,
  input: { productId?: string | null; ingredientId?: string | null; rawQuantity: string }
) {
  assertCan(actor, "foodcost:write");
  const menu = await db.query.menus.findFirst({ where: eq(menus.id, menuId) });
  if (!menu) throw new Error("Menu introuvable.");
  const hasProduct = Boolean(input.productId);
  const hasIngredient = Boolean(input.ingredientId);
  if (hasProduct === hasIngredient) {
    throw new Error("Choisissez un produit OU un ingrédient d'emballage.");
  }

  let quantity: string;
  if (hasProduct) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, input.productId!),
    });
    if (!product || !product.isActive) throw new Error("Produit introuvable.");
    if (!/^\d{1,3}$/.test(input.rawQuantity) || Number(input.rawQuantity) === 0) {
      throw new Error("Quantité invalide (nombre d'unités entier, ex. 1).");
    }
    quantity = `${input.rawQuantity}.0000`;
  } else {
    const ingredient = await db.query.ingredients.findFirst({
      where: eq(ingredients.id, input.ingredientId!),
    });
    if (!ingredient || !ingredient.isActive) {
      throw new Error("Ingrédient introuvable.");
    }
    quantity = convertToBaseUnit(input.rawQuantity, ingredient.unit);
  }

  const existing = await db.query.menuItems.findFirst({
    where: and(
      eq(menuItems.menuId, menuId),
      hasProduct
        ? eq(menuItems.productId, input.productId!)
        : eq(menuItems.ingredientId, input.ingredientId!)
    ),
  });
  if (existing) {
    return auditedUpdate({ id: actor.id }, menuItems, existing.id, { quantity });
  }
  return auditedInsert({ id: actor.id }, menuItems, {
    menuId,
    productId: hasProduct ? input.productId : null,
    ingredientId: hasIngredient ? input.ingredientId : null,
    quantity,
  });
}

export async function removeMenuItem(actor: SessionUser, itemId: string) {
  assertCan(actor, "foodcost:write");
  const item = await db.query.menuItems.findFirst({
    where: eq(menuItems.id, itemId),
  });
  if (!item) throw new Error("Ligne de menu introuvable.");
  await auditedDelete({ id: actor.id }, menuItems, itemId);
}

export async function deleteMenu(actor: SessionUser, menuId: string) {
  assertCan(actor, "foodcost:write");
  const menu = await db.query.menus.findFirst({
    where: eq(menus.id, menuId),
    with: { items: { columns: { id: true } } },
  });
  if (!menu) throw new Error("Menu introuvable.");
  // Lignes supprimées une à une (audit), puis le menu.
  for (const item of menu.items) {
    await auditedDelete({ id: actor.id }, menuItems, item.id);
  }
  await auditedDelete({ id: actor.id }, menus, menuId);
}

export type MenuBoardRow = {
  menuId: string;
  name: string;
  salePriceHT: string | null;
  items: {
    id: string;
    label: string;
    kind: "PRODUIT" | "INGREDIENT";
    quantity: string;
    unit: "KG" | "L" | "PIECE" | null;
  }[];
  costs: {
    depotId: string;
    depotCode: string;
    cost: string | null; // null si un composant est incalculable pour ce dépôt
    pct: string | null;
  }[];
};

// Coût matière des menus par dépôt : Σ (coût produit × quantité) + coût des
// ingrédients directs — dérivé du tableau produits, jamais stocké.
export async function getMenuBoard(
  actor: SessionUser,
  atDate?: string
): Promise<MenuBoardRow[]> {
  assertCan(actor, "foodcost:read");
  const [menuList, board, activeDepots, priceMap] = await Promise.all([
    listMenus(actor),
    getFoodCostBoard(actor, atDate),
    db.query.depots.findMany({
      where: eq(depots.isActive, true),
      orderBy: [asc(depots.code)],
    }),
    getApplicablePrices(actor, atDate),
  ]);
  // coût produit par dépôt, depuis la synthèse produits
  const productCosts = new Map<string, Map<string, string | null>>();
  for (const row of board) {
    productCosts.set(row.productId, new Map(row.costs.map((c) => [c.depotId, c.cost])));
  }

  return menuList
    .filter((m) => m.isActive)
    .map((menu) => {
      const costs = activeDepots.map((depot) => {
        if (menu.items.length === 0) {
          return { depotId: depot.id, depotCode: depot.code, cost: null, pct: null };
        }
        const prices = priceMap.get(depot.id);
        let total = "0.00";
        for (const item of menu.items) {
          if (item.productId) {
            const cost = productCosts.get(item.productId)?.get(depot.id) ?? null;
            if (cost === null) {
              return {
                depotId: depot.id,
                depotCode: depot.code,
                cost: null,
                pct: null,
              };
            }
            total = addAmounts(total, scaleAmount(cost, item.quantity));
          } else if (item.ingredientId) {
            const price = prices?.get(item.ingredientId);
            if (!price) {
              return {
                depotId: depot.id,
                depotCode: depot.code,
                cost: null,
                pct: null,
              };
            }
            total = addAmounts(
              total,
              computeRecipeCost([{ quantity: item.quantity, pricePerUnit: price }])
            );
          }
        }
        return {
          depotId: depot.id,
          depotCode: depot.code,
          cost: total,
          pct: foodCostPct(total, menu.salePriceHT),
        };
      });
      return {
        menuId: menu.id,
        name: menu.name,
        salePriceHT: menu.salePriceHT,
        items: menu.items.map((item) => ({
          id: item.id,
          label: item.product
            ? `${item.product.code} — ${item.product.name}`
            : item.ingredient!.name,
          kind: item.product ? ("PRODUIT" as const) : ("INGREDIENT" as const),
          quantity: item.quantity,
          unit: item.ingredient?.unit ?? null,
        })),
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
