"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { assertCan, ForbiddenError } from "@/lib/authz/guards";
import { safeFormAction } from "@/lib/actions/safe-action";
import {
  parseProductSalesCsv,
  type ParsedProductSaleRow,
} from "@/lib/csv/product-sales-import";
import type { ParseError } from "@/lib/csv/revenue-import";
import { importRows } from "@/services/product-sales.service";

// Import CSV des ventes par produit — même flux en deux temps que le CA :
// prévisualisation sans écriture, puis validation explicite.

export type ProductCsvPreviewState = {
  error?: string;
  fileName?: string;
  rows?: ParsedProductSaleRow[];
  errors?: ParseError[];
};

export async function parseProductCsvAction(
  _prev: ProductCsvPreviewState,
  formData: FormData
): Promise<ProductCsvPreviewState> {
  const actor = await requireUser();
  try {
    assertCan(actor, "revenue:import");
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
  const { rows, errors } = parseProductSalesCsv(text);
  return { fileName: file.name, rows, errors };
}

export const confirmProductImportAction = safeFormAction(
  {
    permission: "revenue:import",
    schema: z.object({
      rows: z.array(
        z.object({
          storeCode: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          productCode: z.string().min(1),
          quantity: z.number().int().min(0),
          amount: z.string().regex(/^-?\d+\.\d{2}$/).nullable(),
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
    revalidatePath("/hq-18b8ba/produits");
    revalidatePath("/direction/cockpit");
    const parts = [
      `${result.imported} ligne${result.imported > 1 ? "s" : ""} créée${result.imported > 1 ? "s" : ""}`,
      `${result.updated} mise${result.updated > 1 ? "s" : ""} à jour`,
    ];
    if (result.errors.length > 0) {
      throw new Error(
        `Import partiel : ${parts.join(", ")} — ${result.errors[0].message}`
      );
    }
    return `Import produits terminé : ${parts.join(", ")}.`;
  }
);
