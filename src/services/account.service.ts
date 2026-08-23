import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { auditedUpdate } from "@/lib/db/audited";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { invalidateOtherUserSessions, type SessionUser } from "@/lib/auth/session";

// ────────────────────────────────────────────────────────────────
// Self-service du compte connecté (étape 28) : chaque utilisateur — y compris
// SALARIE et FRANCHISE — gère ses coordonnées, son e-mail et son mot de passe.
// Aucune permission requise : le périmètre est strictement `actor.id`.
// ────────────────────────────────────────────────────────────────

export async function getMyProfile(actor: SessionUser) {
  const row = await db.query.users.findFirst({
    where: eq(users.id, actor.id),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      pole: true,
    },
  });
  if (!row) throw new Error("Compte introuvable.");
  return row;
}

export async function updateMyProfile(
  actor: SessionUser,
  input: { firstName: string; lastName: string; phone: string | null }
) {
  return auditedUpdate({ id: actor.id }, users, actor.id, {
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  });
}

async function assertCurrentPassword(userId: string, currentPassword: string) {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { passwordHash: true },
  });
  if (!row || !(await verifyPassword(row.passwordHash, currentPassword))) {
    throw new Error("Mot de passe actuel incorrect.");
  }
}

export async function changeMyEmail(
  actor: SessionUser,
  input: { email: string; currentPassword: string }
) {
  await assertCurrentPassword(actor.id, input.currentPassword);
  const taken = await db.query.users.findFirst({
    where: and(eq(users.email, input.email), ne(users.id, actor.id)),
    columns: { id: true },
  });
  if (taken) {
    throw new Error("Cette adresse e-mail est déjà utilisée par un autre compte.");
  }
  return auditedUpdate({ id: actor.id }, users, actor.id, { email: input.email });
}

// Change le mot de passe puis déconnecte les AUTRES appareils. La session
// courante (keepSessionId = hash du token du cookie) reste valide : aucun
// cookie à réécrire, l'utilisateur reste connecté ici.
export async function changeMyPassword(
  actor: SessionUser,
  input: {
    currentPassword: string;
    newPassword: string;
    keepSessionId: string | null;
  }
) {
  await assertCurrentPassword(actor.id, input.currentPassword);
  const passwordHash = await hashPassword(input.newPassword);
  await auditedUpdate({ id: actor.id }, users, actor.id, { passwordHash });
  await invalidateOtherUserSessions(actor.id, input.keepSessionId);
}
