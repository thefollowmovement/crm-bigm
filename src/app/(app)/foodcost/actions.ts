"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createIngredient,
  createMenu,
  deleteMenu,
  getOrCreateRecipe,
  removeMenuItem,
  removeRecipeItem,
  setIngredientPrice,
  setMenuItem,
  setMenuSalePrice,
  setProductSalePrice,
  setRecipeItemFromRaw,
  updateIngredient,
} from "@/services/foodcost.service";
import { createDepot } from "@/services/purchases.service";

const priceString = z
  .string()
  .trim()
  .regex(/^\d{1,8}(?:[.,]\d{1,4})?$/, "Tarif invalide (4 décimales max, ex. 8,4500)")
  .transform((v) => v.replace(",", "."));

const amountString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 9,50)")
  .transform((v) => v.replace(",", "."));

// hissée en const module : jamais d'arrow inline dans un export "use server"
const rawQuantityString = z
  .string()
  .trim()
  .regex(/^\d{1,7}(?:[.,]\d{1,4})?$/, "Quantité invalide")
  .transform((v) => v.replace(",", "."));

export const createIngredientAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      name: z.string().trim().min(1, "Nom requis"),
      unit: z.enum(["KG", "L", "PIECE"]),
    }),
  },
  async (input, actor) => {
    await createIngredient(actor, input);
    revalidatePath("/foodcost");
    return "Ingrédient créé.";
  }
);

export const toggleIngredientAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateIngredient(actor, input.id, { isActive: input.isActive === "true" });
    revalidatePath("/foodcost");
    return input.isActive === "true" ? "Ingrédient réactivé." : "Ingrédient désactivé.";
  }
);

const uuidString = z.string().uuid();

export const setPriceAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      ingredientId: z.string().uuid("Choisissez un ingrédient"),
      // uuid d'un dépôt existant, ou « NOUVEAU » pour une création à la volée
      depotId: z.string().min(1, "Choisissez un dépôt"),
      newDepotCode: z.string().trim().nullable(),
      newDepotName: z.string().trim().nullable(),
      pricePerUnit: priceString,
      effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    }),
    prepare: (formData) => ({
      ingredientId: formData.get("ingredientId"),
      depotId: formData.get("depotId"),
      newDepotCode: nullable(formData.get("newDepotCode")),
      newDepotName: nullable(formData.get("newDepotName")),
      pricePerUnit: formData.get("pricePerUnit"),
      effectiveDate: formData.get("effectiveDate"),
    }),
  },
  async (input, actor) => {
    let depotId = input.depotId;
    const created = depotId === "NOUVEAU";
    if (created) {
      // Création à la volée : le service des achats (propriétaire du
      // référentiel des dépôts) vérifie purchase:write.
      if (!input.newDepotCode || !input.newDepotName) {
        throw new Error("Code et nom du nouveau dépôt requis.");
      }
      const depot = await createDepot(actor, {
        code: input.newDepotCode,
        name: input.newDepotName,
        city: null,
      });
      depotId = depot.id;
      revalidatePath("/achats/depots");
    } else if (!uuidString.safeParse(depotId).success) {
      throw new Error("Choisissez un dépôt.");
    }
    await setIngredientPrice(actor, {
      ingredientId: input.ingredientId,
      depotId,
      pricePerUnit: input.pricePerUnit,
      effectiveDate: input.effectiveDate,
    });
    revalidatePath("/foodcost");
    return created ? "Dépôt créé et tarif enregistré." : "Tarif enregistré.";
  }
);

export const createRecipeAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({ productId: z.string().uuid("Choisissez un produit") }),
  },
  async (input, actor) => {
    await getOrCreateRecipe(actor, input.productId);
    revalidatePath("/foodcost");
    return "Recette prête — ajoutez ses ingrédients.";
  }
);

export const setRecipeItemAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      recipeId: z.string().uuid(),
      ingredientId: z.string().uuid("Choisissez un ingrédient"),
      rawQuantity: rawQuantityString,
    }),
  },
  async (input, actor) => {
    await setRecipeItemFromRaw(actor, input.recipeId, {
      ingredientId: input.ingredientId,
      rawQuantity: input.rawQuantity,
    });
    revalidatePath("/foodcost");
    return "Ingrédient enregistré dans la recette.";
  }
);

export const removeRecipeItemAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({ itemId: z.string().uuid() }),
  },
  async (input, actor) => {
    await removeRecipeItem(actor, input.itemId);
    revalidatePath("/foodcost");
    return "Ingrédient retiré de la recette.";
  }
);

// ── Menus / formules ─────────────────────────────────────────────

export const createMenuAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      name: z.string().trim().min(1, "Nom requis"),
      salePriceHT: amountString.nullable(),
    }),
    prepare: (formData) => ({
      name: formData.get("name"),
      salePriceHT: nullable(formData.get("salePriceHT")),
    }),
  },
  async (input, actor) => {
    await createMenu(actor, input);
    revalidatePath("/foodcost");
    return "Menu créé — ajoutez ses produits et emballages.";
  }
);

// La sélection encode « p:<id> » (produit) ou « i:<id> » (ingrédient).
const menuComponentString = z
  .string()
  .regex(/^[pi]:[0-9a-f-]{36}$/, "Choisissez un produit ou un ingrédient");

export const setMenuItemAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      menuId: z.string().uuid(),
      component: menuComponentString,
      rawQuantity: rawQuantityString,
    }),
  },
  async (input, actor) => {
    const isProduct = input.component.startsWith("p:");
    const id = input.component.slice(2);
    await setMenuItem(actor, input.menuId, {
      productId: isProduct ? id : null,
      ingredientId: isProduct ? null : id,
      rawQuantity: input.rawQuantity,
    });
    revalidatePath("/foodcost");
    return "Ligne du menu enregistrée.";
  }
);

export const removeMenuItemAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({ itemId: z.string().uuid() }),
  },
  async (input, actor) => {
    await removeMenuItem(actor, input.itemId);
    revalidatePath("/foodcost");
    return "Ligne retirée du menu.";
  }
);

export const setMenuSalePriceAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      menuId: z.string().uuid(),
      salePriceHT: amountString.nullable(),
    }),
    prepare: (formData) => ({
      menuId: formData.get("menuId"),
      salePriceHT: nullable(formData.get("salePriceHT")),
    }),
  },
  async (input, actor) => {
    await setMenuSalePrice(actor, input.menuId, input.salePriceHT);
    revalidatePath("/foodcost");
    return "Prix de vente du menu enregistré.";
  }
);

export const deleteMenuAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({ menuId: z.string().uuid() }),
  },
  async (input, actor) => {
    await deleteMenu(actor, input.menuId);
    revalidatePath("/foodcost");
    return "Menu supprimé.";
  }
);

export const setSalePriceAction = safeFormAction(
  {
    permission: "foodcost:write",
    schema: z.object({
      productId: z.string().uuid(),
      salePriceHT: amountString.nullable(),
    }),
    prepare: (formData) => ({
      productId: formData.get("productId"),
      salePriceHT: nullable(formData.get("salePriceHT")),
    }),
  },
  async (input, actor) => {
    await setProductSalePrice(actor, input.productId, input.salePriceHT);
    revalidatePath("/foodcost");
    return "Prix de vente enregistré.";
  }
);
