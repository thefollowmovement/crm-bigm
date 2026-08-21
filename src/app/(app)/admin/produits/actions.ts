"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createFamily,
  createProduct,
  updateFamily,
  updateProduct,
} from "@/services/products.service";

export const createFamilyAction = safeFormAction(
  {
    permission: "product:manage",
    schema: z.object({
      name: z.string().trim().min(1, "Le nom est obligatoire"),
      displayOrder: z.coerce.number().int().min(0).nullable(),
    }),
    prepare: (formData) => ({
      name: formData.get("name"),
      displayOrder: nullable(formData.get("displayOrder")),
    }),
  },
  async (input, actor) => {
    await createFamily(actor, {
      name: input.name,
      displayOrder: input.displayOrder ?? 0,
    });
    revalidatePath("/admin/produits");
    return "Famille créée.";
  }
);

export const toggleFamilyAction = safeFormAction(
  {
    permission: "product:manage",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateFamily(actor, input.id, { isActive: input.isActive === "true" });
    revalidatePath("/admin/produits");
    return input.isActive === "true" ? "Famille réactivée." : "Famille désactivée.";
  }
);

export const createProductAction = safeFormAction(
  {
    permission: "product:manage",
    schema: z.object({
      code: z.string().trim().min(1, "Le code est obligatoire"),
      name: z.string().trim().min(1, "Le nom est obligatoire"),
      familyId: z.string().uuid("Choisissez une famille"),
    }),
  },
  async (input, actor) => {
    await createProduct(actor, input);
    revalidatePath("/admin/produits");
    return "Produit créé.";
  }
);

export const toggleProductAction = safeFormAction(
  {
    permission: "product:manage",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateProduct(actor, input.id, { isActive: input.isActive === "true" });
    revalidatePath("/admin/produits");
    return input.isActive === "true" ? "Produit réactivé." : "Produit désactivé.";
  }
);
