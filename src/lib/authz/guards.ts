import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { stores } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/authz/permissions";

export class ForbiddenError extends Error {
  constructor(message = "Accès refusé.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Garde des services et server actions : lève si la permission manque.
export function assertCan(user: SessionUser, permission: Permission): void {
  if (!can(user, permission)) {
    throw new ForbiddenError(
      `Permission manquante : ${permission} (rôle ${user.role}).`
    );
  }
}

// Entité FRANCHISEUR « Big M CIE » (étape 34) : les dossiers RH rattachés au
// siège (employee.storeId null) ne sont visibles que de ses membres.
// L'ADMIN est toujours membre d'office (pas de verrouillage possible).
export function isFranchisorMember(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.franchisorMember === true;
}

// Ids des boutiques accessibles par un utilisateur FRANCHISE.
// Pour les autres rôles, retourne null (= pas de restriction).
export async function accessibleStoreIds(
  user: SessionUser
): Promise<string[] | null> {
  if (user.role !== "FRANCHISE") return null;
  if (!user.franchiseeId) return [];
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.franchiseeId, user.franchiseeId));
  return rows.map((r) => r.id);
}

// Vérifie qu'un utilisateur peut accéder à une boutique donnée.
export async function assertStoreAccess(
  user: SessionUser,
  storeId: string
): Promise<void> {
  const ids = await accessibleStoreIds(user);
  if (ids !== null && !ids.includes(storeId)) {
    throw new ForbiddenError("Boutique hors de votre périmètre.");
  }
}
