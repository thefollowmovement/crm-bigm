"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { deleteEntry, moveEntry, upsertEntry } from "@/services/planning.service";

const kmString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d)?$/, "Kilométrage invalide (ex. 42,5)")
  .transform((v) => v.replace(",", "."));

export const upsertEntryAction = safeFormAction(
  {
    permission: "planning:write",
    schema: z.object({
      animateurId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
      period: z.enum(["MATIN", "APRES_MIDI", "JOURNEE"]),
      activity: z.enum([
        "VISITE",
        "AUDIT",
        "FORMATION",
        "OUVERTURE",
        "REUNION",
        "TRAJET",
        "AUTRE",
      ]),
      storeId: z.string().uuid().nullable(),
      label: z.string().trim().nullable(),
      kmEstimated: kmString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      animateurId: formData.get("animateurId"),
      date: formData.get("date"),
      period: formData.get("period"),
      activity: formData.get("activity"),
      storeId: nullable(formData.get("storeId")),
      label: nullable(formData.get("label")),
      kmEstimated: nullable(formData.get("kmEstimated")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await upsertEntry(actor, input);
    revalidatePath("/animation/planning");
    return "Créneau enregistré.";
  }
);

// Glisser-déposer : déplace un créneau vers un autre jour (appel direct).
export async function moveEntryAction(input: {
  entryId: string;
  date: string;
}): Promise<{ success?: string; error?: string }> {
  const actor = await requireUser();
  const parsed = z
    .object({
      entryId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Saisie invalide" };
  try {
    await moveEntry(actor, parsed.data.entryId, parsed.data.date);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Une erreur est survenue." };
  }
  revalidatePath("/animation/planning");
  return { success: "Créneau déplacé." };
}

export const deleteEntryAction = safeFormAction(
  {
    permission: "planning:write",
    schema: z.object({ entryId: z.string().uuid() }),
  },
  async (input, actor) => {
    await deleteEntry(actor, input.entryId);
    revalidatePath("/animation/planning");
    return "Créneau supprimé.";
  }
);
