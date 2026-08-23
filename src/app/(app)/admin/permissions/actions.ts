"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import type { Permission } from "@/lib/authz/permissions";
import { setPermissionOverride } from "@/services/permissions.service";

// Le rôle ADMIN est absent à dessein : jamais modifiable.
const overrideSchema = z.object({
  role: z.enum([
    "DIRECTION",
    "COMPTABILITE",
    "RH",
    "ANIMATION",
    "COMMUNICATION",
    "DEVELOPPEMENT",
    "FRANCHISE",
    "SALARIE",
  ]),
  permission: z.string().min(1),
  allowed: z.boolean(),
});

// Action directe (matrice cliquable) — le service revérifie permission:manage
// et l'existence de la permission.
export async function setPermissionOverrideAction(input: {
  role: string;
  permission: string;
  allowed: boolean;
}): Promise<{ success?: string; error?: string }> {
  const actor = await requireUser();
  const parsed = overrideSchema.safeParse(input);
  if (!parsed.success) return { error: "Saisie invalide" };
  try {
    await setPermissionOverride(actor, {
      role: parsed.data.role,
      permission: parsed.data.permission as Permission,
      allowed: parsed.data.allowed,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Une erreur est survenue." };
  }
  revalidatePath("/admin/permissions");
  return { success: "Droits mis à jour." };
}
