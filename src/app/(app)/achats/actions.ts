"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { assertCan, ForbiddenError } from "@/lib/authz/guards";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  parsePurchaseCsv,
  type ParsedPurchaseRow,
} from "@/lib/csv/purchase-import";
import type { ParseError } from "@/lib/csv/revenue-import";
import {
  createDepot,
  importRows,
  updateDepot,
  upsertPurchase,
} from "@/services/purchases.service";

const amountString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

export const upsertPurchaseAction = safeFormAction(
  {
    permission: "purchase:write",
    schema: z.object({
      storeId: z.string().uuid(),
      depotId: z.string().uuid("Choisissez un dépôt"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      reference: z.string().trim().min(1, "Référence requise"),
      amount: amountString,
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      depotId: formData.get("depotId"),
      date: formData.get("date"),
      reference: formData.get("reference"),
      amount: formData.get("amount"),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await upsertPurchase(actor, input);
    revalidatePath("/achats");
    return "Achat enregistré.";
  }
);

// ── Import CSV en deux temps ─────────────────────────────────────

export type PurchaseCsvPreviewState = {
  error?: string;
  fileName?: string;
  rows?: ParsedPurchaseRow[];
  errors?: ParseError[];
};

export async function parsePurchaseCsvAction(
  _prev: PurchaseCsvPreviewState,
  formData: FormData
): Promise<PurchaseCsvPreviewState> {
  const actor = await requireUser();
  try {
    assertCan(actor, "purchase:import");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Accès refusé." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier CSV." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Fichier trop volumineux (5 Mo maximum pour un import)." };
  }
  const text = await file.text();
  const { rows, errors } = parsePurchaseCsv(text);
  return { fileName: file.name, rows, errors };
}

export const confirmPurchaseImportAction = safeFormAction(
  {
    permission: "purchase:import",
    schema: z.object({
      rows: z.array(
        z.object({
          storeCode: z.string().min(1),
          depotCode: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          reference: z.string().min(1),
          amount: z.string().regex(/^-?\d+\.\d{2}$/),
        })
      ),
    }),
    prepare: (formData) => ({
      rows: JSON.parse((formData.get("rows") as string) ?? "[]"),
    }),
  },
  async ({ rows }, actor) => {
    if (rows.length === 0) throw new Error("Aucune ligne valide à importer.");
    const result = await importRows(actor, rows);
    revalidatePath("/achats");
    const parts = [
      `${result.imported} ligne${result.imported > 1 ? "s" : ""} créée${result.imported > 1 ? "s" : ""}`,
      `${result.updated} mise${result.updated > 1 ? "s" : ""} à jour`,
    ];
    if (result.errors.length > 0) {
      throw new Error(
        `Import partiel : ${parts.join(", ")} — ${result.errors[0].message}`
      );
    }
    return `Import des achats terminé : ${parts.join(", ")}.`;
  }
);

// ── Dépôts ───────────────────────────────────────────────────────

export const createDepotAction = safeFormAction(
  {
    permission: "purchase:write",
    schema: z.object({
      code: z.string().trim().min(1, "Code requis"),
      name: z.string().trim().min(1, "Nom requis"),
      city: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      code: formData.get("code"),
      name: formData.get("name"),
      city: nullable(formData.get("city")),
    }),
  },
  async (input, actor) => {
    await createDepot(actor, input);
    revalidatePath("/achats/depots");
    return "Dépôt créé.";
  }
);

export const toggleDepotAction = safeFormAction(
  {
    permission: "purchase:write",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateDepot(actor, input.id, { isActive: input.isActive === "true" });
    revalidatePath("/achats/depots");
    return input.isActive === "true" ? "Dépôt réactivé." : "Dépôt désactivé.";
  }
);
