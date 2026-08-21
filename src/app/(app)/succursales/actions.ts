"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { addExpense, deleteExpense } from "@/services/branches.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

export const addExpenseAction = safeFormAction(
  {
    permission: "branch:write",
    schema: z.object({
      storeId: z.string().uuid(),
      expenseDate: dateString,
      category: z.enum([
        "LOYER",
        "SALAIRES",
        "CHARGES_SOCIALES",
        "FOURNISSEURS",
        "ENERGIE",
        "MAINTENANCE",
        "BANQUE",
        "IMPOTS",
        "AUTRE",
      ]),
      amount: amountString,
      label: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      expenseDate: formData.get("expenseDate"),
      category: formData.get("category"),
      amount: formData.get("amount"),
      label: nullable(formData.get("label")),
    }),
  },
  async (input, actor) => {
    await addExpense(actor, input);
    revalidatePath(`/succursales/${input.storeId}`);
    revalidatePath("/succursales");
    return "Dépense enregistrée.";
  }
);

export const deleteExpenseAction = safeFormAction(
  {
    permission: "branch:write",
    schema: z.object({
      storeId: z.string().uuid(),
      expenseId: z.string().uuid(),
    }),
  },
  async (input, actor) => {
    await deleteExpense(actor, input.expenseId);
    revalidatePath(`/succursales/${input.storeId}`);
    revalidatePath("/succursales");
    return "Dépense supprimée.";
  }
);
