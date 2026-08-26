"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import type { Permission } from "@/lib/authz/permissions";
import { setPermissionOverride } from "@/services/permissions.service";
import {
  createCustomRole,
  deleteCustomRole,
  setCustomRolePermission,
} from "@/services/custom-roles.service";
import { safeFormAction } from "@/lib/actions/safe-action";

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
  revalidatePath("/hq-18b8ba/permissions");
  return { success: "Droits mis à jour." };
}

// ── Rôles personnalisés (étape 35) ───────────────────────────────

// Cellule de la matrice pour un rôle personnalisé (appel direct).
export async function setCustomRolePermissionAction(input: {
  customRoleId: string;
  permission: string;
  allowed: boolean;
}): Promise<{ success?: string; error?: string }> {
  const actor = await requireUser();
  const parsed = z
    .object({
      customRoleId: z.string().uuid(),
      permission: z.string().min(1),
      allowed: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Saisie invalide" };
  try {
    await setCustomRolePermission(actor, {
      customRoleId: parsed.data.customRoleId,
      permission: parsed.data.permission as Permission,
      allowed: parsed.data.allowed,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Une erreur est survenue." };
  }
  revalidatePath("/hq-18b8ba/permissions");
  return { success: "Droits mis à jour." };
}

const baseRoleSchema = z.enum([
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
  "SALARIE",
]);

export const createCustomRoleAction = safeFormAction(
  {
    permission: "permission:manage",
    schema: z.object({
      name: z.string().trim().min(2, "Nom du rôle requis"),
      baseRole: baseRoleSchema,
      description: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      name: formData.get("name"),
      baseRole: formData.get("baseRole"),
      description: (formData.get("description") as string) || null,
    }),
  },
  async (input, actor) => {
    await createCustomRole(actor, input);
    revalidatePath("/hq-18b8ba/permissions");
    revalidatePath("/hq-18b8ba/utilisateurs");
    return `Rôle « ${input.name} » créé — ajustez ses droits dans la matrice.`;
  }
);

export const deleteCustomRoleAction = safeFormAction(
  {
    permission: "permission:manage",
    schema: z.object({ customRoleId: z.string().uuid() }),
    prepare: (formData) => ({ customRoleId: formData.get("customRoleId") }),
  },
  async ({ customRoleId }, actor) => {
    await deleteCustomRole(actor, customRoleId);
    revalidatePath("/hq-18b8ba/permissions");
    revalidatePath("/hq-18b8ba/utilisateurs");
    return "Rôle personnalisé supprimé.";
  }
);
