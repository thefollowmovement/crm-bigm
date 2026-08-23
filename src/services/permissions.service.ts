import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { permissionOverrides } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  type Permission,
  type Role,
} from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";

// ────────────────────────────────────────────────────────────────
// Droits d'accès dynamiques (étape 30) : l'admin accorde ou retire une
// permission à un RÔLE entier, à chaud, sans redéploiement. Seuls les écarts
// par rapport à la matrice statique sont stockés ; revenir à la valeur par
// défaut supprime la ligne. Le rôle ADMIN n'est jamais modifiable.
// ────────────────────────────────────────────────────────────────

export async function listPermissionOverrides(actor: SessionUser) {
  assertCan(actor, "permission:manage");
  return db.query.permissionOverrides.findMany({
    orderBy: [asc(permissionOverrides.role), asc(permissionOverrides.permission)],
  });
}

export async function setPermissionOverride(
  actor: SessionUser,
  input: { role: Role; permission: Permission; allowed: boolean }
) {
  assertCan(actor, "permission:manage");
  if (input.role === "ADMIN") {
    throw new Error("Les droits du rôle ADMIN ne sont pas modifiables.");
  }
  if (!ALL_PERMISSIONS.includes(input.permission)) {
    throw new Error("Permission inconnue.");
  }

  const defaultValue = PERMISSIONS[input.role].has(input.permission);
  const existing = await db.query.permissionOverrides.findFirst({
    where: and(
      eq(permissionOverrides.role, input.role),
      eq(permissionOverrides.permission, input.permission)
    ),
  });

  // Retour à la valeur par défaut de la matrice : on supprime l'écart.
  if (input.allowed === defaultValue) {
    if (existing) {
      await auditedDelete({ id: actor.id }, permissionOverrides, existing.id);
    }
    return { override: false, allowed: input.allowed };
  }

  if (existing) {
    await auditedUpdate({ id: actor.id }, permissionOverrides, existing.id, {
      allowed: input.allowed,
    });
  } else {
    await auditedInsert({ id: actor.id }, permissionOverrides, {
      role: input.role,
      permission: input.permission,
      allowed: input.allowed,
    });
  }
  return { override: true, allowed: input.allowed };
}
