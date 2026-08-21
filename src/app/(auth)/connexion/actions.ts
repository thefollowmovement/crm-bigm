"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  invalidateSessionToken,
  setSessionCookie,
} from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit/log";
import { cookies } from "next/headers";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export type LoginState = { error?: string };

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  const { email, password } = parsed.data;
  const ip = await clientIp();

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const genericError = { error: "Identifiants incorrects." };

  if (!user || !user.isActive) {
    await logAuditEvent({
      userId: user?.id ?? null,
      action: "LOGIN_FAILED",
      tableName: "users",
      recordId: user?.id ?? email,
      snapshot: { email, reason: user ? "compte désactivé" : "email inconnu" },
      ip,
    });
    return genericError;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    await logAuditEvent({
      userId: user.id,
      action: "LOGIN_FAILED",
      tableName: "users",
      recordId: user.id,
      snapshot: { email, reason: "mot de passe incorrect" },
      ip,
    });
    return genericError;
  }

  const h = await headers();
  const { token, expiresAt } = await createSession(user.id, {
    ip,
    userAgent: h.get("user-agent"),
  });
  await setSessionCookie(token, expiresAt);
  await logAuditEvent({
    userId: user.id,
    action: "LOGIN",
    tableName: "users",
    recordId: user.id,
    ip,
  });
  redirect("/");
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const { validateSessionToken } = await import("@/lib/auth/session");
    const user = await validateSessionToken(token);
    await invalidateSessionToken(token);
    if (user) {
      await logAuditEvent({
        userId: user.id,
        action: "LOGOUT",
        tableName: "users",
        recordId: user.id,
        ip: await clientIp(),
      });
    }
  }
  await clearSessionCookie();
  redirect("/connexion");
}
