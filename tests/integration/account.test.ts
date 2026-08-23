import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, sessions, users } from "@/db/schema";
import { createSession, hashToken, type SessionUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  changeMyEmail,
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
} from "@/services/account.service";
import { startImpersonation } from "@/services/users.service";
import { resetDb } from "./setup/reset-db";
import { TEST_PASSWORD, createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
  };
}

describe("mon compte & connexion en tant que", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("chaque utilisateur (même SALARIE) met à jour ses coordonnées, audité", async () => {
    const salarie = asSession(await createTestUser({ role: "SALARIE" }));

    await updateMyProfile(salarie, {
      firstName: "Sami",
      lastName: "Nouveau",
      phone: "06 12 34 56 78",
    });

    const profile = await getMyProfile(salarie);
    expect(profile.firstName).toBe("Sami");
    expect(profile.phone).toBe("06 12 34 56 78");

    const log = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "users"),
        eq(auditLogs.recordId, salarie.id),
        eq(auditLogs.action, "UPDATE")
      ),
    });
    expect(log?.userId).toBe(salarie.id);
  });

  it("changement d'e-mail : mot de passe exigé, unicité respectée", async () => {
    const user = asSession(await createTestUser({ role: "ANIMATION" }));
    const autre = await createTestUser({ role: "RH", pole: "RH" });

    await expect(
      changeMyEmail(user, { email: "nouveau@bigm.fr", currentPassword: "faux" })
    ).rejects.toThrow(/incorrect/);

    await expect(
      changeMyEmail(user, { email: autre.email, currentPassword: TEST_PASSWORD })
    ).rejects.toThrow(/déjà utilisée/);

    await changeMyEmail(user, {
      email: "nouveau@bigm.fr",
      currentPassword: TEST_PASSWORD,
    });
    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(row?.email).toBe("nouveau@bigm.fr");
  });

  it("changement de mot de passe : vérifie l'actuel, garde CETTE session, déconnecte le reste", async () => {
    const user = asSession(await createTestUser({ role: "FRANCHISE" }));
    // L'appareil courant + un autre appareil connecté.
    const current = await createSession(user.id);
    await createSession(user.id);

    await expect(
      changeMyPassword(user, {
        currentPassword: "mauvais-mdp",
        newPassword: "NouveauMdp!2026",
        keepSessionId: hashToken(current.token),
      })
    ).rejects.toThrow(/incorrect/);

    await changeMyPassword(user, {
      currentPassword: TEST_PASSWORD,
      newPassword: "NouveauMdp!2026",
      keepSessionId: hashToken(current.token),
    });

    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(await verifyPassword(row!.passwordHash, "NouveauMdp!2026")).toBe(true);
    // Le hash n'est jamais journalisé en clair dans l'audit.
    const log = await db.query.auditLogs.findFirst({
      where: and(eq(auditLogs.tableName, "users"), eq(auditLogs.recordId, user.id)),
    });
    expect(JSON.stringify(log?.changes ?? {})).not.toContain("argon2");
    // Seule la session courante survit.
    const open = await db.query.sessions.findMany({
      where: eq(sessions.userId, user.id),
    });
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(hashToken(current.token));
  });

  it("l'usurpation est réservée à l'ADMIN, cible active uniquement, auditée IMPERSONATE", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const cible = await createTestUser({ role: "FRANCHISE" });
    const inactif = await createTestUser({ role: "ANIMATION", isActive: false });

    // La DIRECTION n'a pas ce pouvoir, et on ne s'usurpe pas soi-même.
    await expect(startImpersonation(direction, cible.id)).rejects.toThrow(
      ForbiddenError
    );
    await expect(startImpersonation(admin, admin.id)).rejects.toThrow(
      /déjà connecté/
    );
    await expect(startImpersonation(admin, inactif.id)).rejects.toThrow(
      /désactivé/
    );
    // Pas d'usurpation en chaîne depuis une session déjà usurpée.
    await expect(
      startImpersonation({ ...admin, impersonatorUserId: cible.id }, cible.id)
    ).rejects.toThrow(/revenez d'abord/);

    const target = await startImpersonation(admin, cible.id);
    expect(target.id).toBe(cible.id);
    // Le retour du service n'expose jamais le hash du mot de passe.
    expect("passwordHash" in target).toBe(false);

    const log = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "users"),
        eq(auditLogs.recordId, cible.id),
        eq(auditLogs.action, "IMPERSONATE")
      ),
    });
    expect(log?.userId).toBe(admin.id);

    // La session usurpée porte bien l'admin d'origine.
    await createSession(cible.id, { impersonatorUserId: admin.id });
    const s = await db.query.sessions.findFirst({
      where: eq(sessions.userId, cible.id),
    });
    expect(s?.impersonatorUserId).toBe(admin.id);
  });
});
