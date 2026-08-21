"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import { upsertProfile } from "@/services/planning.service";

const costString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,3})?$/, "Coût invalide (ex. 0,45)")
  .transform((v) => v.replace(",", "."));

export const upsertProfileAction = safeFormAction(
  {
    permission: "planning:write",
    schema: z.object({
      userId: z.string().uuid(),
      zone: z.string().trim().nullable(),
      theoreticalRoute: z.string().trim().nullable(),
      costPerKm: costString.nullable(),
      notes: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      userId: formData.get("userId"),
      zone: nullable(formData.get("zone")),
      theoreticalRoute: nullable(formData.get("theoreticalRoute")),
      costPerKm: nullable(formData.get("costPerKm")),
      notes: nullable(formData.get("notes")),
    }),
  },
  async (input, actor) => {
    await upsertProfile(actor, input.userId, {
      zone: input.zone,
      theoreticalRoute: input.theoreticalRoute,
      costPerKm: input.costPerKm,
      notes: input.notes,
    });
    revalidatePath(`/animation/animateurs/${input.userId}`);
    revalidatePath("/animation/animateurs");
    return "Fiche animateur enregistrée.";
  }
);
