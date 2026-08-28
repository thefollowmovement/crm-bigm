import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs } from "@/db/schema";
import { createSession, validateSessionToken, type SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  listPermissionOverrides,
  setPermissionOverride,
} from "@/services/permissions.service";
import { resetDb } from "./setup/reset-db";
import { createTestUser } from "../helpers/factories";

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

describe("droits d'accès dynamiques", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("réservé à l'ADMIN ; le rôle ADMIN et les permissions inconnues sont refusés", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );

    await expect(
      setPermissionOverride(direction, {
        role: "RH",
        permission: "accounting:read",
        allowed: true,
      })
    ).rejects.toThrow(ForbiddenError);
    await expect(listPermissionOverrides(direction)).rejects.toThrow(ForbiddenError);

    await expect(
      setPermissionOverride(admin, {
        role: "ADMIN",
        permission: "accounting:read",
        allowed: false,
      })
    ).rejects.toThrow(/ADMIN/);

    await expect(
      setPermissionOverride(admin, {
        role: "RH",
        // @ts-expect-error — permission inexistante volontaire
        permission: "hack:all",
        allowed: true,
      })
    ).rejects.toThrow(/inconnue/);
  });

  it("seuls les écarts sont stockés ; revenir au défaut supprime la ligne (audité)", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));

    // Octroi d'une permission hors matrice → écart créé.
    const granted = await setPermissionOverride(admin, {
      role: "RH",
      permission: "accounting:read",
      allowed: true,
    });
    expect(granted).toEqual({ override: true, allowed: true });
    const rows = await listPermissionOverrides(admin);
    expect(rows).toHaveLength(1);
    const createLog = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "permission_overrides"),
        eq(auditLogs.action, "CREATE")
      ),
    });
    expect(createLog?.userId).toBe(admin.id);

    // Poser la valeur par défaut (RH n'a pas accounting:read) → écart supprimé.
    const reset = await setPermissionOverride(admin, {
      role: "RH",
      permission: "accounting:read",
      allowed: false,
    });
    expect(reset).toEqual({ override: false, allowed: false });
    expect(await db.query.permissionOverrides.findMany()).toHaveLength(0);
    const deleteLog = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.tableName, "permission_overrides"),
        eq(auditLogs.action, "DELETE")
      ),
    });
    expect(deleteLog?.userId).toBe(admin.id);

    // Reposer la valeur par défaut sans écart existant : sans effet.
    await setPermissionOverride(admin, {
      role: "RH",
      permission: "accounting:read",
      allowed: false,
    });
    expect(await db.query.permissionOverrides.findMany()).toHaveLength(0);
  });

  it("les écarts sont chargés dans la session et appliqués par can()", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const animateur = await createTestUser({ role: "ANIMATION" });

    await setPermissionOverride(admin, {
      role: "ANIMATION",
      permission: "visit:write",
      allowed: false,
    });
    await setPermissionOverride(admin, {
      role: "ANIMATION",
      permission: "accounting:read",
      allowed: true,
    });

    const { token } = await createSession(animateur.id);
    const sessionUser = await validateSessionToken(token);
    expect(sessionUser?.permissionOverrides).toEqual({
      "visit:write": false,
      "accounting:read": true,
    });
    expect(can(sessionUser!, "visit:write")).toBe(false);
    expect(can(sessionUser!, "accounting:read")).toBe(true);
    // Les permissions sans écart suivent la matrice.
    expect(can(sessionUser!, "visit:read")).toBe(true);

    // La session d'un ADMIN ne charge aucun écart.
    const { token: adminToken } = await createSession(admin.id);
    const adminSession = await validateSessionToken(adminToken);
    expect(adminSession?.permissionOverrides).toBeUndefined();
  });
});
