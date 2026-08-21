"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { assertCan, ForbiddenError } from "@/lib/authz/guards";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  parseRevenueCsv,
  type ParseError,
  type ParsedRevenueRow,
} from "@/lib/csv/revenue-import";
import { importRows, upsertEntry } from "@/services/revenue.service";

const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

export const upsertEntryAction = safeFormAction(
  {
    permission: "revenue:write",
    schema: z.object({
      storeId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      channel: z.enum([
        "SUR_PLACE",
        "EMPORTE",
        "TABLETTE",
        "UBER_EATS",
        "DELIVEROO",
        "AUTRE",
      ]),
      channelLabel: z.string().trim().nullable(),
      grossAmount: amountString,
      netAmount: amountString.nullable(),
      orderCount: z.coerce
        .number()
        .int("Nombre de commandes invalide")
        .min(0, "Nombre de commandes invalide")
        .nullable(),
    }),
    prepare: (formData) => ({
      storeId: formData.get("storeId"),
      date: formData.get("date"),
      channel: formData.get("channel"),
      channelLabel: nullable(formData.get("channelLabel")),
      grossAmount: formData.get("grossAmount"),
      netAmount: nullable(formData.get("netAmount")),
      orderCount: nullable(formData.get("orderCount")),
    }),
  },
  async (input, actor) => {
    await upsertEntry(actor, input);
    revalidatePath("/ca");
    return "Chiffre d'affaires enregistré.";
  }
);

// ── Import CSV en deux temps ─────────────────────────────────────

export type CsvPreviewState = {
  error?: string;
  fileName?: string;
  rows?: ParsedRevenueRow[];
  errors?: ParseError[];
};

// 1er temps : parse SANS écrire, retourne la prévisualisation.
export async function parseCsvAction(
  _prev: CsvPreviewState,
  formData: FormData
): Promise<CsvPreviewState> {
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
  const { rows, errors } = parseRevenueCsv(text);
  return { fileName: file.name, rows, errors };
}

// 2e temps : l'utilisateur valide la prévisualisation → écriture.
export const confirmImportAction = safeFormAction(
  {
    permission: "revenue:import",
    schema: z.object({
      rows: z.array(
        z.object({
          storeCode: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          channel: z.enum([
            "SUR_PLACE",
            "EMPORTE",
            "TABLETTE",
            "UBER_EATS",
            "DELIVEROO",
            "AUTRE",
          ]),
          channelLabel: z.string().nullable(),
          grossAmount: z.string().regex(/^-?\d+\.\d{2}$/),
          netAmount: z.string().regex(/^-?\d+\.\d{2}$/).nullable(),
          orderCount: z.number().int().min(0).nullable(),
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
    revalidatePath("/ca");
    const parts = [
      `${result.imported} ligne${result.imported > 1 ? "s" : ""} créée${result.imported > 1 ? "s" : ""}`,
      `${result.updated} mise${result.updated > 1 ? "s" : ""} à jour`,
    ];
    if (result.errors.length > 0) {
      throw new Error(
        `Import partiel : ${parts.join(", ")} — ${result.errors[0].message}`
      );
    }
    return `Import terminé : ${parts.join(", ")}.`;
  }
);
