"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { createResale, updateResale } from "@/services/resales.service";

const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."))
  .nullable();

const resaleFields = z.object({
  wish: z.enum(["VENTE_TOTALE", "VENTE_PARTIELLE", "RECHERCHE_ASSOCIE"]),
  askingPrice: amountString,
  urgency: z.enum(["BASSE", "NORMALE", "HAUTE", "CRITIQUE"]),
  status: z.enum(["ACTIVE", "SUSPENDUE", "CONCLUE", "ANNULEE"]),
  notes: z.string().trim().nullable(),
});

function prepareResale(formData: FormData) {
  return {
    wish: formData.get("wish"),
    askingPrice: nullable(formData.get("askingPrice")),
    urgency: formData.get("urgency") ?? "NORMALE",
    status: formData.get("status") ?? "ACTIVE",
    notes: nullable(formData.get("notes")),
  };
}

export const createResaleAction = safeFormAction(
  {
    permission: "resale:write",
    schema: resaleFields.extend({ storeId: z.string().uuid("Choisissez une boutique") }),
    prepare: (formData) => ({
      ...prepareResale(formData),
      storeId: nullable(formData.get("storeId")),
    }),
  },
  async (input, actor) => {
    await createResale(actor, input);
    revalidatePath("/developpement/cessions");
    return "Cession enregistrée.";
  }
);

export const updateResaleAction = safeFormAction(
  {
    permission: "resale:write",
    schema: resaleFields.extend({ resaleId: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareResale(formData),
      resaleId: formData.get("resaleId"),
    }),
  },
  async (input, actor) => {
    const { resaleId, ...fields } = input;
    await updateResale(actor, resaleId, fields);
    revalidatePath(`/developpement/cessions/${resaleId}`);
    revalidatePath("/developpement/cessions");
    return "Cession mise à jour.";
  }
);
