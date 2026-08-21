import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { vaultSecrets } from "@/db/schema";
import { auditedDelete, auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { logAuditEvent } from "@/lib/audit/log";
import { assertCan } from "@/lib/authz/guards";
import type { SessionUser } from "@/lib/auth/session";
import {
  decryptSecret,
  encryptSecret,
  vaultKeyVersion,
} from "@/lib/vault/crypto";

// Coffre-fort de mots de passe (cdc §21). Le clair n'existe qu'en transit :
// chiffré à l'écriture, déchiffré À L'UNITÉ à la révélation (auditée REVEAL).
// Les DTO de liste ne contiennent JAMAIS le ciphertext ni le clair.

export type VaultSecretDTO = {
  id: string;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  keyVersion: number;
  updatedAt: Date;
};

export async function listSecrets(actor: SessionUser): Promise<VaultSecretDTO[]> {
  assertCan(actor, "vault:read");
  const rows = await db.query.vaultSecrets.findMany({
    orderBy: [asc(vaultSecrets.label)],
  });
  // le champ `encrypted` reste côté serveur
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    username: row.username,
    url: row.url,
    notes: row.notes,
    keyVersion: row.keyVersion,
    updatedAt: row.updatedAt,
  }));
}

export type SecretInput = {
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
};

export async function createSecret(
  actor: SessionUser,
  input: SecretInput & { secret: string }
) {
  assertCan(actor, "vault:write");
  if (!input.secret) throw new Error("Le secret est obligatoire.");
  const { secret, ...fields } = input;
  const row = await auditedInsert({ id: actor.id }, vaultSecrets, {
    ...fields,
    encrypted: encryptSecret(secret),
    keyVersion: vaultKeyVersion(),
  });
  return { id: row.id };
}

export async function updateSecret(
  actor: SessionUser,
  id: string,
  input: SecretInput & { secret: string | null }
) {
  assertCan(actor, "vault:write");
  const existing = await db.query.vaultSecrets.findFirst({
    where: eq(vaultSecrets.id, id),
  });
  if (!existing) throw new Error("Secret introuvable.");
  const { secret, ...fields } = input;
  await auditedUpdate({ id: actor.id }, vaultSecrets, id, {
    ...fields,
    // secret vide = métadonnées seules, le chiffré reste inchangé
    ...(secret ? { encrypted: encryptSecret(secret), keyVersion: vaultKeyVersion() } : {}),
  });
}

export async function deleteSecret(actor: SessionUser, id: string) {
  assertCan(actor, "vault:write");
  const existing = await db.query.vaultSecrets.findFirst({
    where: eq(vaultSecrets.id, id),
  });
  if (!existing) throw new Error("Secret introuvable.");
  await auditedDelete({ id: actor.id }, vaultSecrets, id);
}

// Révélation UNITAIRE : déchiffre un seul secret et journalise QUI l'a lu.
export async function revealSecret(actor: SessionUser, id: string): Promise<string> {
  assertCan(actor, "vault:read");
  const row = await db.query.vaultSecrets.findFirst({
    where: eq(vaultSecrets.id, id),
  });
  if (!row) throw new Error("Secret introuvable.");
  const plaintext = decryptSecret(row.encrypted);
  await logAuditEvent({
    userId: actor.id,
    action: "REVEAL",
    tableName: "vault_secrets",
    recordId: id,
    changes: { label: { old: null, new: row.label } },
  });
  return plaintext;
}
