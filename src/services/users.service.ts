import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customRoles, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { logAuditEvent } from "@/lib/audit/log";
import { hashPassword } from "@/lib/auth/password";
import { invalidateAllUserSessions, type SessionUser } from "@/lib/auth/session";
import { assertCan } from "@/lib/authz/guards";

type Role = (typeof users.$inferSelect)["role"];
type Pole = NonNullable<(typeof users.$inferSelect)["pole"]>;

export async function listUsers(actor: SessionUser) {
  assertCan(actor, "user:manage");
  return db.query.users.findMany({
    orderBy: [asc(users.lastName), asc(users.firstName)],
    columns: { passwordHash: false },
    with: {
      franchisee: { columns: { id: true, companyName: true } },
      customRole: { columns: { id: true, name: true } },
    },
  });
}

// Rôle personnalisé assigné (étape 35) : le rôle de base de l'utilisateur est
// TOUJOURS dérivé du rôle personnalisé — jamais des deux champs à la fois.
async function resolveCustomRole(customRoleId: string | null) {
  if (!customRoleId) return null;
  const role = await db.query.customRoles.findFirst({
    where: eq(customRoles.id, customRoleId),
  });
  if (!role) throw new Error("Rôle personnalisé introuvable.");
  return role;
}

export async function createUser(
  actor: SessionUser,
  input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: Role;
    pole: Pole | null;
    franchiseeId: string | null;
    franchisorMember?: boolean;
    customRoleId?: string | null;
  }
) {
  assertCan(actor, "user:manage");
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existing) {
    throw new Error("Un utilisateur avec cette adresse e-mail existe déjà.");
  }
  const customRole = await resolveCustomRole(input.customRoleId ?? null);
  const passwordHash = await hashPassword(input.password);
  return auditedInsert({ id: actor.id }, users, {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    role: customRole ? customRole.baseRole : input.role,
    pole: input.pole,
    franchiseeId: input.franchiseeId,
    franchisorMember: input.franchisorMember ?? false,
    customRoleId: customRole?.id ?? null,
  });
}

export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: {
    firstName: string;
    lastName: string;
    role: Role;
    pole: Pole | null;
    franchiseeId: string | null;
    franchisorMember?: boolean;
    customRoleId?: string | null;
  }
) {
  assertCan(actor, "user:manage");
  const customRole = await resolveCustomRole(input.customRoleId ?? null);
  return auditedUpdate({ id: actor.id }, users, userId, {
    ...input,
    role: customRole ? customRole.baseRole : input.role,
    customRoleId: customRole?.id ?? null,
  });
}

export async function setUserActive(
  actor: SessionUser,
  userId: string,
  isActive: boolean
) {
  assertCan(actor, "user:manage");
  if (actor.id === userId && !isActive) {
    throw new Error("Impossible de désactiver votre propre compte.");
  }
  const updated = await auditedUpdate({ id: actor.id }, users, userId, { isActive });
  if (!isActive) {
    // Déconnecte immédiatement l'utilisateur désactivé.
    await invalidateAllUserSessions(userId);
  }
  return updated;
}

// Prépare une connexion « en tant que » (étape 28) : vérifie le droit et la
// cible, journalise l'événement IMPERSONATE, et retourne la cible. La création
// de session + cookie reste dans l'action (infrastructure auth).
export async function startImpersonation(actor: SessionUser, targetUserId: string) {
  assertCan(actor, "user:impersonate");
  if (actor.id === targetUserId) {
    throw new Error("Vous êtes déjà connecté avec ce compte.");
  }
  if (actor.impersonatorUserId) {
    throw new Error(
      "Vous êtes déjà connecté en tant qu'un autre utilisateur : revenez d'abord à votre compte."
    );
  }
  const target = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
    columns: { passwordHash: false },
  });
  if (!target) throw new Error("Utilisateur introuvable.");
  if (!target.isActive) {
    throw new Error("Impossible de se connecter en tant qu'un compte désactivé.");
  }
  await logAuditEvent({
    userId: actor.id,
    action: "IMPERSONATE",
    tableName: "users",
    recordId: target.id,
    snapshot: { phase: "DEBUT", email: target.email },
  });
  return target;
}

// Journalise la fin d'une usurpation (retour au compte admin).
export async function logImpersonationEnd(
  impersonatorId: string,
  targetUserId: string
) {
  await logAuditEvent({
    userId: impersonatorId,
    action: "IMPERSONATE",
    tableName: "users",
    recordId: targetUserId,
    snapshot: { phase: "FIN" },
  });
}

export async function resetUserPassword(
  actor: SessionUser,
  userId: string,
  newPassword: string
) {
  assertCan(actor, "user:manage");
  const passwordHash = await hashPassword(newPassword);
  const updated = await auditedUpdate({ id: actor.id }, users, userId, {
    passwordHash,
  });
  // Toute session existante devient invalide après un reset.
  await invalidateAllUserSessions(userId);
  return updated;
}
