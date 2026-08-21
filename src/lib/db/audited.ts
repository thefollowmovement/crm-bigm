import "server-only";

import { eq, getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { auditLogs } from "@/db/schema";

// ────────────────────────────────────────────────────────────────
// Helpers d'écriture AUDITÉS : chaque insert/update/delete métier écrit son
// entrée d'AuditLog dans la même transaction (traçabilité atomique).
// Les services doivent passer par ces helpers — jamais par db.insert/update/
// delete directement (règle CLAUDE.md n°2).
// ────────────────────────────────────────────────────────────────

// Champs jamais journalisés (secrets) — `encrypted` : ciphertext du
// coffre-fort, exclu même chiffré des snapshots d'audit.
const SENSITIVE_FIELDS = new Set(["passwordHash", "encrypted"]);
// Champs techniques exclus du diff (bruit)
const NOISE_FIELDS = new Set(["updatedAt", "createdAt"]);

export type AuditActor = {
  id: string | null; // null = système (cron, seed)
  ip?: string | null;
};

type AnyRow = Record<string, unknown>;

// Table minimale requise : une colonne `id`.
type TableWithId = PgTable & { id: unknown };

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function sanitizeSnapshot(row: AnyRow): AnyRow {
  const out: AnyRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    out[key] = serializeValue(value);
  }
  return out;
}

export function computeDiff(
  before: AnyRow,
  after: AnyRow
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (SENSITIVE_FIELDS.has(key)) {
      // Un secret modifié est journalisé sans sa valeur.
      if (before[key] !== after[key]) {
        changes[key] = { old: "***", new: "***" };
      }
      continue;
    }
    if (NOISE_FIELDS.has(key)) continue;
    const oldV = serializeValue(before[key]);
    const newV = serializeValue(after[key]);
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      changes[key] = { old: oldV ?? null, new: newV ?? null };
    }
  }
  return changes;
}

export async function auditedInsert<T extends TableWithId>(
  actor: AuditActor,
  table: T,
  values: T["$inferInsert"]
): Promise<T["$inferSelect"]> {
  return db.transaction(async (tx) => {
    const [row] = (await tx
      .insert(table)
      .values(values)
      .returning()) as AnyRow[];
    await tx.insert(auditLogs).values({
      userId: actor.id,
      action: "CREATE",
      tableName: getTableName(table),
      recordId: String(row.id),
      snapshot: sanitizeSnapshot(row),
      ip: actor.ip ?? null,
    });
    return row as T["$inferSelect"];
  });
}

export async function auditedUpdate<T extends TableWithId>(
  actor: AuditActor,
  table: T,
  id: string,
  values: Partial<T["$inferInsert"]>
): Promise<T["$inferSelect"]> {
  return db.transaction(async (tx) => {
    const idColumn = (table as unknown as { id: Parameters<typeof eq>[0] }).id;
    // Verrouille la ligne pour un diff exact sous concurrence.
    const [before] = (await tx
      .select()
      .from(table as PgTable)
      .where(eq(idColumn, id))
      .for("update")) as AnyRow[];
    if (!before) {
      throw new Error(`Enregistrement introuvable (${getTableName(table)} ${id}).`);
    }
    const [after] = (await tx
      .update(table as PgTable)
      .set(values as AnyRow)
      .where(eq(idColumn, id))
      .returning()) as AnyRow[];
    const changes = computeDiff(before, after);
    if (Object.keys(changes).length > 0) {
      await tx.insert(auditLogs).values({
        userId: actor.id,
        action: "UPDATE",
        tableName: getTableName(table),
        recordId: id,
        changes,
        ip: actor.ip ?? null,
      });
    }
    return after as T["$inferSelect"];
  });
}

export async function auditedDelete<T extends TableWithId>(
  actor: AuditActor,
  table: T,
  id: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const idColumn = (table as unknown as { id: Parameters<typeof eq>[0] }).id;
    const [before] = (await tx
      .select()
      .from(table as PgTable)
      .where(eq(idColumn, id))
      .for("update")) as AnyRow[];
    if (!before) return;
    await tx.delete(table as PgTable).where(eq(idColumn, id));
    await tx.insert(auditLogs).values({
      userId: actor.id,
      action: "DELETE",
      tableName: getTableName(table),
      recordId: id,
      snapshot: sanitizeSnapshot(before),
      ip: actor.ip ?? null,
    });
  });
}

// Événement agrégé (ex. import CSV) : un seul log pour N lignes.
export async function auditAggregate(
  actor: AuditActor,
  input: {
    action: "IMPORT";
    tableName: string;
    recordId: string;
    snapshot: unknown;
  }
) {
  await db.insert(auditLogs).values({
    userId: actor.id,
    action: input.action,
    tableName: input.tableName,
    recordId: input.recordId,
    snapshot: input.snapshot as never,
    ip: actor.ip ?? null,
  });
}
