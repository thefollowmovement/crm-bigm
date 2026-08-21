import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { sessions, users } from "@/db/schema";
import {
  createSession,
  hashToken,
  invalidateAllUserSessions,
  validateSessionToken,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { resetDb } from "./setup/reset-db";
import {
  TEST_PASSWORD,
  TEST_PASSWORD_HASH,
  createTestUser,
} from "../helpers/factories";

describe("sessions en base", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("le hash précalculé des factories correspond au mot de passe de test", async () => {
    expect(await verifyPassword(TEST_PASSWORD_HASH, TEST_PASSWORD)).toBe(true);
  });

  it("crée puis valide une session", async () => {
    const user = await createTestUser({ role: "COMPTABILITE" });
    const { token } = await createSession(user.id, { ip: "10.0.0.1" });

    const sessionUser = await validateSessionToken(token);
    expect(sessionUser?.id).toBe(user.id);
    expect(sessionUser?.role).toBe("COMPTABILITE");

    // seul le hash est stocké
    const stored = await db.query.sessions.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(hashToken(token));
    expect(stored[0].id).not.toBe(token);
  });

  it("rejette un token inconnu", async () => {
    expect(await validateSessionToken("token-bidon")).toBeNull();
  });

  it("rejette et supprime une session expirée", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, user.id));

    expect(await validateSessionToken(token)).toBeNull();
    expect(await db.query.sessions.findMany()).toHaveLength(0);
  });

  it("rejette la session d'un utilisateur désactivé", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    await db.update(users).set({ isActive: false }).where(eq(users.id, user.id));

    expect(await validateSessionToken(token)).toBeNull();
  });

  it("invalide toutes les sessions d'un utilisateur", async () => {
    const user = await createTestUser();
    const { token: t1 } = await createSession(user.id);
    const { token: t2 } = await createSession(user.id);

    await invalidateAllUserSessions(user.id);

    expect(await validateSessionToken(t1)).toBeNull();
    expect(await validateSessionToken(t2)).toBeNull();
  });

  it("prolonge une session proche de l'expiration (glissante)", async () => {
    const user = await createTestUser();
    const { token } = await createSession(user.id);
    const soon = new Date(Date.now() + 60_000);
    await db
      .update(sessions)
      .set({ expiresAt: soon })
      .where(eq(sessions.userId, user.id));

    await validateSessionToken(token);

    const [row] = await db.query.sessions.findMany();
    expect(row.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
  });
});
