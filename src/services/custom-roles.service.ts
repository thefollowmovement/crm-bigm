import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customRolePermissions, customRoles, users } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import {
  ALL_PERMISSIONS,
  type Permission,
  type Role,
} from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";

// ────────────────────────────────────────────────────────────────
// Rôles personnalisés (étape 35) : un rôle de base (jamais ADMIN) + des
// écarts de permissions propres, assignable à un utilisateur. Seuls les
// écarts par rapport à la matrice STATIQUE du rôle de base sont stockés ;
// pour le reste, le rôle personnalisé suit son rôle de base (y compris les
// ajustements à chaud posés sur celui-ci).
// ────────────────────────────────────────────────────────────────

// Lecture : nécessaire à la gestion des droits ET à l'assignation dans
// /hq-18b8ba/utilisateurs (user:manage suffit).
export async function listCustomRoles(actor: SessionUser) {
  assertCan(actor, "user:manage");
  return db.query.customRoles.findMany({
    orderBy: [asc(customRoles.name)],
    with: { permissions: { columns: { permission: true, allowed: true } } },
  });
}

export async function createCustomRole(
  actor: SessionUser,
  input: { name: string; baseRole: Role; description: string | null }
) {
  assertCan(actor, "permission:manage");
  if (input.baseRole === "ADMIN") {
    throw new Error("Un rôle personnalisé ne peut pas être basé sur ADMIN.");
  }
  const existing = await db.query.customRoles.findFirst({
    where: eq(customRoles.name, input.name),
  });
  if (existing) throw new Error("Un rôle personnalisé porte déjà ce nom.");
  return auditedInsert({ id: actor.id }, customRoles, { ...input });
}

// Suppression uniquement si aucun utilisateur ne porte le rôle.
export async function deleteCustomRole(actor: SessionUser, customRoleId: string) {
  assertCan(actor, "permission:manage");
  const assigned = await db.query.users.findFirst({
    where: eq(users.customRoleId, customRoleId),
    columns: { id: true },
  });
  if (assigned) {
    throw new Error(
      "Ce rôle est encore assigné à des utilisateurs : réassignez-les d'abord."
    );
  }
  await auditedDelete({ id: actor.id }, customRoles, customRoleId);
}

// Fige une permission du rôle personnalisé. Contrairement aux écarts des
// rôles de base, chaque valeur cochée est stockée EXPLICITEMENT : elle prime
// sur la matrice ET sur les ajustements à chaud du rôle de base — c'est ce
// qui permet de retirer à un rôle personnalisé un droit accordé à sa base.
export async function setCustomRolePermission(
  actor: SessionUser,
  input: { customRoleId: string; permission: Permission; allowed: boolean }
) {
  assertCan(actor, "permission:manage");
  if (!ALL_PERMISSIONS.includes(input.permission)) {
    throw new Error("Permission inconnue.");
  }
  const role = await db.query.customRoles.findFirst({
    where: eq(customRoles.id, input.customRoleId),
  });
  if (!role) throw new Error("Rôle personnalisé introuvable.");

  const existing = await db.query.customRolePermissions.findFirst({
    where: and(
      eq(customRolePermissions.customRoleId, input.customRoleId),
      eq(customRolePermissions.permission, input.permission)
    ),
  });
  if (existing) {
    if (existing.allowed !== input.allowed) {
      await auditedUpdate({ id: actor.id }, customRolePermissions, existing.id, {
        allowed: input.allowed,
      });
    }
  } else {
    await auditedInsert({ id: actor.id }, customRolePermissions, {
      customRoleId: input.customRoleId,
      permission: input.permission,
      allowed: input.allowed,
    });
  }
  return { override: true, allowed: input.allowed };
}
