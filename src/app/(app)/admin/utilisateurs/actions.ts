"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import {
  SESSION_COOKIE,
  createSession,
  invalidateSessionToken,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  createUser,
  logImpersonationEnd,
  resetUserPassword,
  setUserActive,
  startImpersonation,
  updateUser,
} from "@/services/users.service";

export type ActionState = { error?: string; success?: string };

const roleSchema = z.enum([
  "ADMIN",
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
  "FRANCHISE",
  "SALARIE",
]);
const poleSchema = z.enum([
  "DIRECTION",
  "COMPTABILITE",
  "RH",
  "ANIMATION",
  "COMMUNICATION",
  "DEVELOPPEMENT",
]);

const baseUserSchema = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  role: roleSchema,
  pole: poleSchema.nullable(),
  franchiseeId: z.string().uuid().nullable(),
  // Membre de l'entité FRANCHISEUR « Big M CIE » (dossiers RH du siège)
  franchisorMember: z.boolean(),
});

const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères");

function parseNullable(value: FormDataEntryValue | null): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v === "" || v === "none" ? null : v;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue.";
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
      password: passwordSchema,
    })
    .merge(baseUserSchema)
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      role: formData.get("role"),
      pole: parseNullable(formData.get("pole")),
      franchiseeId: parseNullable(formData.get("franchiseeId")),
      franchisorMember: formData.get("franchisorMember") === "true",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  try {
    await createUser(actor, parsed.data);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/utilisateurs");
  return { success: "Utilisateur créé." };
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z
    .object({ userId: z.string().uuid() })
    .merge(baseUserSchema)
    .safeParse({
      userId: formData.get("userId"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      role: formData.get("role"),
      pole: parseNullable(formData.get("pole")),
      franchiseeId: parseNullable(formData.get("franchiseeId")),
      franchisorMember: formData.get("franchisorMember") === "true",
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  const { userId, ...input } = parsed.data;
  try {
    await updateUser(actor, userId, input);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/utilisateurs");
  return { success: "Utilisateur mis à jour." };
}

export async function setUserActiveAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z
    .object({ userId: z.string().uuid(), isActive: z.enum(["true", "false"]) })
    .safeParse({
      userId: formData.get("userId"),
      isActive: formData.get("isActive"),
    });
  if (!parsed.success) return { error: "Saisie invalide" };
  try {
    await setUserActive(actor, parsed.data.userId, parsed.data.isActive === "true");
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/utilisateurs");
  return {
    success:
      parsed.data.isActive === "true" ? "Compte réactivé." : "Compte désactivé.",
  };
}

// Connexion « en tant que » : remplace la session courante par une session
// au nom de la cible, en mémorisant l'admin d'origine (bannière + retour).
export async function impersonateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z.object({ userId: z.string().uuid() }).safeParse({
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { error: "Saisie invalide" };

  let targetId: string;
  try {
    const target = await startImpersonation(actor, parsed.data.userId);
    targetId = target.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }

  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE)?.value;
  if (currentToken) await invalidateSessionToken(currentToken);
  const h = await headers();
  const { token, expiresAt } = await createSession(targetId, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    impersonatorUserId: actor.id,
  });
  await setSessionCookie(token, expiresAt);
  redirect("/");
}

// Fin d'usurpation : détruit la session usurpée et reconnecte l'admin.
export async function exitImpersonationAction() {
  const user = await requireUser();
  if (!user.impersonatorUserId) redirect("/");

  const impersonator = await db.query.users.findFirst({
    where: eq(users.id, user.impersonatorUserId),
    columns: { id: true, isActive: true },
  });

  const store = await cookies();
  const currentToken = store.get(SESSION_COOKIE)?.value;
  if (currentToken) await invalidateSessionToken(currentToken);

  if (!impersonator || !impersonator.isActive) {
    // L'admin d'origine n'existe plus : retour à l'écran de connexion.
    redirect("/connexion");
  }
  const h = await headers();
  const { token, expiresAt } = await createSession(impersonator.id, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });
  await setSessionCookie(token, expiresAt);
  await logImpersonationEnd(impersonator.id, user.id);
  redirect("/admin/utilisateurs");
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireUser();
  const parsed = z
    .object({ userId: z.string().uuid(), password: passwordSchema })
    .safeParse({
      userId: formData.get("userId"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  try {
    await resetUserPassword(actor, parsed.data.userId, parsed.data.password);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/admin/utilisateurs");
  return { success: "Mot de passe réinitialisé." };
}
