import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { softwareRegistry, softwareUsers, users } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";

// Registre des logiciels du réseau (cdc §21) : nom, utilité, responsable et
// personnes autorisées. Les mots de passe vont dans le coffre-fort, pas ici.

export async function listSoftware(actor: SessionUser) {
  assertCan(actor, "software:read");
  return db.query.softwareRegistry.findMany({
    with: {
      owner: { columns: { id: true, firstName: true, lastName: true } },
      users: {
        with: {
          user: { columns: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [asc(softwareRegistry.name)],
  });
}

export type SoftwareInput = {
  name: string;
  purpose: string | null;
  url: string | null;
  ownerId: string | null;
  accessLevelNotes: string | null;
};

export async function createSoftware(actor: SessionUser, input: SoftwareInput) {
  assertCan(actor, "software:write");
  return auditedInsert({ id: actor.id }, softwareRegistry, { ...input });
}

export async function updateSoftware(
  actor: SessionUser,
  id: string,
  input: SoftwareInput & { isActive: boolean }
) {
  assertCan(actor, "software:write");
  const existing = await db.query.softwareRegistry.findFirst({
    where: eq(softwareRegistry.id, id),
  });
  if (!existing) throw new Error("Logiciel introuvable.");
  return auditedUpdate({ id: actor.id }, softwareRegistry, id, { ...input });
}

// Remplace la liste des utilisateurs autorisés (diff audité ligne à ligne).
export async function setSoftwareUsers(
  actor: SessionUser,
  softwareId: string,
  userIds: string[]
) {
  assertCan(actor, "software:write");
  const software = await db.query.softwareRegistry.findFirst({
    where: eq(softwareRegistry.id, softwareId),
  });
  if (!software) throw new Error("Logiciel introuvable.");

  const wanted = new Set(userIds);
  const current = await db.query.softwareUsers.findMany({
    where: eq(softwareUsers.softwareId, softwareId),
  });
  const currentIds = new Set(current.map((r) => r.userId));

  for (const row of current) {
    if (!wanted.has(row.userId)) {
      await auditedDelete({ id: actor.id }, softwareUsers, row.id);
    }
  }
  for (const userId of wanted) {
    if (!currentIds.has(userId)) {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
      if (!user) throw new Error("Utilisateur introuvable.");
      await auditedInsert({ id: actor.id }, softwareUsers, { softwareId, userId });
    }
  }
}
