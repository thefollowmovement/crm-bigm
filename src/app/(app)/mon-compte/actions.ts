"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { SESSION_COOKIE, hashToken } from "@/lib/auth/session";
import {
  changeMyEmail,
  changeMyPassword,
  updateMyProfile,
} from "@/services/account.service";

export type ActionState = { error?: string; success?: string };

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  phone: z.string().trim().max(30, "Numéro de téléphone trop long"),
});

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z
    .string()
    .min(10, "Le nouveau mot de passe doit contenir au moins 10 caractères"),
  confirmPassword: z.string(),
});

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  try {
    await updateMyProfile(actor, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone === "" ? null : parsed.data.phone,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/mon-compte");
  return { success: "Coordonnées mises à jour." };
}

export async function changeEmailAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  try {
    await changeMyEmail(actor, parsed.data);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/mon-compte");
  return { success: "Adresse e-mail mise à jour." };
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }
  try {
    // La session courante est conservée ; seuls les autres appareils sont
    // déconnectés (aucune réécriture de cookie → pas de rechargement de page).
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    await changeMyPassword(actor, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepSessionId: token ? hashToken(token) : null,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { success: "Mot de passe modifié. Vos autres appareils sont déconnectés." };
}
