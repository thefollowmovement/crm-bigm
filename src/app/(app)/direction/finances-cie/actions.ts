"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { addFlow, deleteFlow, setBudget } from "@/services/company-finance.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

const categorySchema = z.enum([
  "DROIT_ENTREE",
  "REDEVANCE",
  "REDEVANCE_COMMUNICATION",
  "PRESTATION",
  "AUTRE_ENTREE",
  "PARTENAIRES",
  "COMMUNICATION",
  "SALAIRES",
  "LOGICIELS",
  "PRESTATAIRES",
  "FRAIS_GENERAUX",
  "AUTRE_SORTIE",
]);

export const addFlowAction = safeFormAction(
  {
    permission: "company-finance:write",
    schema: z.object({
      flowDate: dateString,
      category: categorySchema,
      amount: amountString,
      label: z.string().trim().nullable(),
      invoiceId: z.string().uuid().nullable(),
      partnerId: z.string().uuid().nullable(),
    }),
    prepare: (formData) => ({
      flowDate: formData.get("flowDate"),
      category: formData.get("category"),
      amount: formData.get("amount"),
      label: nullable(formData.get("label")),
      invoiceId: nullable(formData.get("invoiceId")),
      partnerId: nullable(formData.get("partnerId")),
    }),
  },
  async (input, actor) => {
    await addFlow(actor, input);
    revalidatePath("/direction/finances-cie");
    return "Flux enregistré.";
  }
);

export const deleteFlowAction = safeFormAction(
  {
    permission: "company-finance:write",
    schema: z.object({ flowId: z.string().uuid() }),
  },
  async (input, actor) => {
    await deleteFlow(actor, input.flowId);
    revalidatePath("/direction/finances-cie");
    return "Flux supprimé.";
  }
);

export const setBudgetAction = safeFormAction(
  {
    permission: "company-finance:write",
    schema: z.object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
      category: categorySchema,
      amount: amountString,
    }),
  },
  async (input, actor) => {
    await setBudget(actor, input);
    revalidatePath("/direction/finances-cie");
    return "Budget enregistré.";
  }
);
