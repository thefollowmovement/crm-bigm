import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
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
    with: { franchisee: { columns: { id: true, companyName: true } } },
  });
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
  }
) {
  assertCan(actor, "user:manage");
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existing) {
    throw new Error("Un utilisateur avec cette adresse e-mail existe déjà.");
  }
  const passwordHash = await hashPassword(input.password);
  return auditedInsert({ id: actor.id }, users, {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    pole: input.pole,
    franchiseeId: input.franchiseeId,
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
  }
) {
  assertCan(actor, "user:manage");
  return auditedUpdate({ id: actor.id }, users, userId, input);
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
