import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "session";

function durationMs() {
  const days = Number(process.env.SESSION_DURATION_DAYS ?? 14);
  return days * 24 * 60 * 60 * 1000;
}

// Le token circule uniquement dans le cookie ; la base ne stocke que son hash.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: string,
  meta: {
    ip?: string | null;
    userAgent?: string | null;
    impersonatorUserId?: string | null;
  } = {}
) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + durationMs());
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    impersonatorUserId: meta.impersonatorUserId ?? null,
  });
  return { token, expiresAt };
}

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: (typeof users.$inferSelect)["role"];
  pole: (typeof users.$inferSelect)["pole"];
  franchiseeId: string | null;
  // Id de l'admin réellement connecté quand la session est une usurpation
  // « se connecter en tant que » (étape 28). Absent sinon.
  impersonatorUserId?: string | null;
};

export async function validateSessionToken(
  token: string
): Promise<SessionUser | null> {
  const id = hashToken(token);
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
    with: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (!row.user.isActive) return null;

  // Expiration glissante : prolonge quand la moitié de la durée est écoulée.
  if (row.expiresAt.getTime() - Date.now() < durationMs() / 2) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + durationMs()) })
      .where(eq(sessions.id, id));
  }

  const { user } = row;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
    impersonatorUserId: row.impersonatorUserId ?? null,
  };
}

export async function invalidateSessionToken(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function invalidateAllUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// Déconnecte tous les appareils SAUF la session donnée (id = hash du token) :
// utilisé au changement de mot de passe pour garder l'utilisateur connecté ici.
export async function invalidateOtherUserSessions(
  userId: string,
  keepSessionId: string | null
) {
  const byUser = eq(sessions.userId, userId);
  await db
    .delete(sessions)
    .where(keepSessionId ? and(byUser, ne(sessions.id, keepSessionId)) : byUser);
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
