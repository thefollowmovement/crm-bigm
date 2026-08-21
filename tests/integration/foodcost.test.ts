import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createIngredient,
  getFoodCostBoard,
  getOrCreateRecipe,
  getProductCost,
  setIngredientPrice,
  setProductSalePrice,
  setRecipeItemFromRaw,
} from "@/services/foodcost.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestDepot,
  createTestProduct,
  createTestUser,
} from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

afterAll(async () => {
  await pool.end();
});

describe("Food Cost", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("coût matière exact, différent par dépôt, avec % du prix de vente", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const lyon = await createTestDepot({ code: "DPS-A" });
    const paris = await createTestDepot({ code: "DPS-B" });
    const steak = await createIngredient(direction, { name: "Steak", unit: "KG" });
    const pain = await createIngredient(direction, { name: "Pain", unit: "PIECE" });
    const product = await createTestProduct({ code: "BURGER-T" });

    await setIngredientPrice(direction, {
      ingredientId: steak.id,
      depotId: lyon.id,
      pricePerUnit: "9.8000",
      effectiveDate: "2026-01-01",
    });
    await setIngredientPrice(direction, {
      ingredientId: steak.id,
      depotId: paris.id,
      pricePerUnit: "10.4000",
      effectiveDate: "2026-01-01",
    });
    await setIngredientPrice(direction, {
      ingredientId: pain.id,
      depotId: lyon.id,
      pricePerUnit: "0.3500",
      effectiveDate: "2026-01-01",
    });

    const recipe = await getOrCreateRecipe(direction, product.id);
    await setRecipeItemFromRaw(direction, recipe.id, {
      ingredientId: steak.id,
      rawQuantity: "90", // grammes
    });
    await setRecipeItemFromRaw(direction, recipe.id, {
      ingredientId: pain.id,
      rawQuantity: "1",
    });
    await setProductSalePrice(direction, product.id, "9.00");

    // Lyon : 0,09 × 9,80 + 0,35 = 1,232 → 1,23 €
    const lyonCost = await getProductCost(direction, product.id, lyon.id);
    expect(lyonCost).toEqual({ cost: "1.23", pct: "13.7" });

    // Paris : tarif du pain manquant → coût incalculable.
    const parisCost = await getProductCost(direction, product.id, paris.id);
    expect(parisCost).toBeNull();

    // Après ajout du tarif manquant, le coût Paris diffère de Lyon.
    await setIngredientPrice(direction, {
      ingredientId: pain.id,
      depotId: paris.id,
      pricePerUnit: "0.3900",
      effectiveDate: "2026-01-01",
    });
    const parisCost2 = await getProductCost(direction, product.id, paris.id);
    expect(parisCost2).toEqual({ cost: "1.33", pct: "14.8" });

    const board = await getFoodCostBoard(direction);
    expect(board).toHaveLength(1);
    expect(board[0].costs.map((c) => c.cost)).toEqual(["1.23", "1.33"]);
  });

  it("le tarif applicable est le dernier à date d'effet <= date demandée", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const depot = await createTestDepot();
    const steak = await createIngredient(direction, { name: "Steak", unit: "KG" });
    const product = await createTestProduct();
    const recipe = await getOrCreateRecipe(direction, product.id);
    await setRecipeItemFromRaw(direction, recipe.id, {
      ingredientId: steak.id,
      rawQuantity: "1000", // 1 kg pour lire le tarif directement
    });

    await setIngredientPrice(direction, {
      ingredientId: steak.id,
      depotId: depot.id,
      pricePerUnit: "8.0000",
      effectiveDate: "2026-01-01",
    });
    await setIngredientPrice(direction, {
      ingredientId: steak.id,
      depotId: depot.id,
      pricePerUnit: "9.0000",
      effectiveDate: "2026-06-01",
    });

    const before = await getProductCost(direction, product.id, depot.id, "2026-05-31");
    expect(before?.cost).toBe("8.00");
    const after = await getProductCost(direction, product.id, depot.id, "2026-06-01");
    expect(after?.cost).toBe("9.00");
  });

  it("l'écriture est réservée à la direction, la lecture interdite au franchisé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: null })
    );
    await expect(
      createIngredient(compta, { name: "Interdit", unit: "KG" })
    ).rejects.toThrow(ForbiddenError);
    await expect(getFoodCostBoard(franchise)).rejects.toThrow(ForbiddenError);
    // La compta lit la synthèse.
    expect(await getFoodCostBoard(compta)).toEqual([]);
  });
});
