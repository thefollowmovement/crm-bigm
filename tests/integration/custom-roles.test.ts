import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { customRolePermissions, users } from "@/db/schema";
import { createSession, validateSessionToken, type SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createCustomRole,
  deleteCustomRole,
  listCustomRoles,
  setCustomRolePermission,
} from "@/services/custom-roles.service";
import { setPermissionOverride } from "@/services/permissions.service";
import { createUser, updateUser } from "@/services/users.service";
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

describe("rôles personnalisés", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("création réservée à l'ADMIN ; jamais basé sur ADMIN ; nom unique", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );

    await expect(
      createCustomRole(direction, {
        name: "Interdit",
        baseRole: "RH",
        description: null,
      })
    ).rejects.toThrow(ForbiddenError);

    await expect(
      createCustomRole(admin, { name: "Sur-admin", baseRole: "ADMIN", description: null })
    ).rejects.toThrow(/ADMIN/);

    await createCustomRole(admin, {
      name: "Manager RH junior",
      baseRole: "RH",
      description: "RH sans écriture",
    });
    await expect(
      createCustomRole(admin, {
        name: "Manager RH junior",
        baseRole: "ANIMATION",
        description: null,
      })
    ).rejects.toThrow(/déjà ce nom/);

    // La DIRECTION liste les rôles (assignation via user:manage).
    expect(await listCustomRoles(direction)).toHaveLength(1);
  });

  it("chaque case cochée est figée explicitement (une ligne par permission)", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const role = await createCustomRole(admin, {
      name: "RH lecture seule",
      baseRole: "RH",
      description: null,
    });

    // Retirer une permission que la base possède, en accorder une hors base.
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "hr:write",
      allowed: false,
    });
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "finance:read",
      allowed: true,
    });
    // Re-basculer une valeur ne crée pas de doublon : la ligne est mise à jour.
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "hr:write",
      allowed: true,
    });
    const rows = await db.query.customRolePermissions.findMany({
      where: eq(customRolePermissions.customRoleId, role.id),
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.permission === "hr:write")?.allowed).toBe(true);

    await expect(
      setCustomRolePermission(admin, {
        customRoleId: role.id,
        // @ts-expect-error — permission inexistante volontaire
        permission: "hack:all",
        allowed: true,
      })
    ).rejects.toThrow(/inconnue/);
  });

  it("assignation : rôle de base dérivé, écarts appliqués à la session (priorité au rôle personnalisé)", async () => {
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const role = await createCustomRole(admin, {
      name: "RH étendu finances",
      baseRole: "RH",
      description: null,
    });
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "finance:read",
      allowed: true,
    });
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "commtask:request",
      allowed: false,
    });
    // Le rôle de base RH reçoit planning:write à chaud… mais le rôle
    // personnalisé le fige à faux : sa valeur prime.
    await setPermissionOverride(admin, {
      role: "RH",
      permission: "planning:write",
      allowed: true,
    });
    await setCustomRolePermission(admin, {
      customRoleId: role.id,
      permission: "planning:write",
      allowed: false,
    });

    const created = await createUser(admin, {
      email: "junior@test.fr",
      password: "MotDePasse!26",
      firstName: "Jade",
      lastName: "Junior",
      role: "ANIMATION", // valeur de remplissage : dérivée du rôle personnalisé
      pole: "RH",
      franchiseeId: null,
      customRoleId: role.id,
    });
    expect(created.role).toBe("RH");
    expect(created.customRoleId).toBe(role.id);

    const { token } = await createSession(created.id);
    const session = await validateSessionToken(token);
    // Valeurs figées du rôle personnalisé appliquées…
    expect(can(session!, "finance:read")).toBe(true);
    expect(can(session!, "commtask:request")).toBe(false); // retirée vs la base
    // …et prioritaires sur l'ajustement à chaud du rôle de base…
    expect(can(session!, "planning:write")).toBe(false);
    // …la matrice de base restant valable pour le reste.
    expect(can(session!, "hr:read")).toBe(true);
    expect(can(session!, "user:manage")).toBe(false);

    // Suppression bloquée tant qu'un utilisateur porte le rôle.
    await expect(deleteCustomRole(admin, role.id)).rejects.toThrow(/assigné/);
    await updateUser(admin, created.id, {
      firstName: "Jade",
      lastName: "Junior",
      role: "RH",
      pole: "RH",
      franchiseeId: null,
      customRoleId: null,
    });
    const detached = await db.query.users.findFirst({
      where: eq(users.id, created.id),
    });
    expect(detached?.customRoleId).toBeNull();
    await deleteCustomRole(admin, role.id);
    expect(await listCustomRoles(admin)).toHaveLength(0);
  });
});
